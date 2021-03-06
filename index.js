const Discord = require('discord.js');
const twit = require('twit');
const client = new Discord.Client();
const NO_CHANNEL = -1;
const fetch = require('node-fetch');
const fs = require('fs');

const {prefix, token, youtubetoken} = require("./config.json");
const twitter = require('./twitter-keys');

var youtube = require('youtube-search');
const { access_token } = require('./twitter-keys');
const { map } = require('async');

var T = new twit(twitter);

var opts = {
    maxResults: 1,
    key: youtubetoken,
};

var channel = NO_CHANNEL, active = 0, dirty = 0, INTERVAL = 5*3600000, VID_INTERVAL = 12*3600*1000;
var ROLES_CHANNEL = NO_CHANNEL, QUESTIONS_CHANNEL = NO_CHANNEL, BUSY = 0;
let tweets = new Set();
var vids = new Set(), ytchannels = new Set();
var emojiname = ['1⃣','2⃣', '3⃣', '4⃣', '5⃣', '6⃣', '7⃣', '8⃣', '9⃣'];
    rolename = ["Algebra", "Statistics & Probability", "Precalc & Trig", 
            "Calculus", "Linear Algebra", "Discrete Maths", "Advanced Math", "Computer Science",
            "Physics"];
var score_roles = ['Wood Puncher', 'Stone Miner', 'Citizen', 'Sub-helper', 'Helper', 'Supervisor', 
            'Head Supervisor', 'Moderator'];
var threshold = [100, 200, 400, 800, 1600, 3200, 4200, 6000];
var BANNED = new Set();
var POINTS = new Map();
var PROBLEMS = new Map();
var PENDING_USERS = new Map();
var CURID = 0;

var datajs = new Map(), data;

function set_to_map(set) {
    var ret = new Map();
    var cnt = 0;
    for (let i of set) {
        var st = cnt.toString();
        ret[st] = i;
        cnt++;
    }
    return ret;
}

function map_to_collection(map) {
    var ret = new Map();
    var cnt = 0;
    for (let [key,value] of map) {
        var st = cnt.toString();
        ret[st] = {"key": key, "value": value};
        cnt++;
    }
    return ret;
}

function collection_to_set(collection) {
    var ret = new Set();
    for (var v in collection)
        ret.add(collection[v]);
    return ret;
}

function collection_to_map(collection) {
    var ret = new Map();
    for (var v in collection)
        ret.set(collection[v].key, collection[v].value);
    return ret;
}

function save_data() {
    datajs = new Map();
    datajs["channel"] = channel;
    datajs["active"] = active;
    datajs["INTERVAL"] = INTERVAL;
    datajs["VID_INTERVAL"] = VID_INTERVAL;
    datajs["ROLES_CHANNEL"] = ROLES_CHANNEL;
    datajs["QUESTIONS_CHANNEL"] = QUESTIONS_CHANNEL;
    datajs["tweets"] = set_to_map(tweets);
    datajs["vids"] = set_to_map(vids);
    datajs["ytchannels"] = set_to_map(ytchannels);
    datajs["BANNED"] = set_to_map(BANNED);
    datajs["POINTS"] = map_to_collection(POINTS);
    datajs["PROBLEMS"] = map_to_collection(PROBLEMS);
    datajs["PENDING_USERS"] = map_to_collection(PENDING_USERS);
    datajs["CURID"] = CURID;
    data = JSON.stringify(datajs, null, 2);
    fs.writeFile("data.json", data, err => {if (err) console.log(err);});
}

function update_data() {
    data = fs.readFileSync("data.json");
    datajs = JSON.parse(data);
    if (datajs.channel != NO_CHANNEL)
        channel = client.channels.cache.get(datajs.channel.id);
    active = datajs.active;
    INTERVAL = datajs.INTERVAL;
    VID_INTERVAL = datajs.VID_INTERVAL;
    if (datajs.ROLES_CHANNEL != NO_CHANNEL) {
        ROLES_CHANNEL = client.channels.cache.get(datajs.ROLES_CHANNEL.id);
        ROLES_CHANNEL.messages.fetch();
    }
    if (datajs.QUESTIONS_CHANNEL != NO_CHANNEL)
        QUESTIONS_CHANNEL = client.channels.cache.get(datajs.QUESTIONS_CHANNEL.id);
    tweets = collection_to_set(datajs.tweets);
    vids = collection_to_set(datajs.vids);
    ytchannels = collection_to_set(datajs.ytchannels);
    BANNED = collection_to_set(datajs.BANNED);
    POINTS = collection_to_map(datajs.POINTS);
    PROBLEMS = collection_to_map(datajs.PROBLEMS);
    PENDING_USERS = collection_to_map(datajs.PENDING_USERS);
    CURID = datajs.CURID;
}


function update_role(member, new_score, guild) {
    for (var i = 0; i < score_roles.length; i++) {
        if (new_score >= threshold[i] && !member.bot) {
            var role = guild.roles.cache.find(role => role.name === score_roles[i]);
            if (i + 1 == 8 || new_score < threshold[i + 1])
                member.roles.add(role).catch(console.error);
            else if (member.roles.cache.find(r => r.name === score_roles[i]))
                member.roles.remove(role).catch(console.error);
        } else if (new_score < threshold[i] && member.roles.cache.find(r => r.name === score_roles[i])) {
            var role = guild.roles.cache.find(role => role.name === score_roles[i]);
            member.roles.remove(role).catch(console.error); 
        }
    }
}

async function react(message) {
    for (var i = 0; i < emojiname.length; i++)
        message.react(emojiname[i]).catch();
}

function getRandomInt(max) {
    return Math.floor(Math.random() * Math.floor(max));
}

async function send_fact(c) {
    var Text = "", url = "";
    response = await T.get('statuses/user_timeline', {user_id: '3511430425', count: 200, tweet_mode: "extended"});
    var idx = getRandomInt(200);
    var iter = 0;
    while (tweets.has(response.data[idx].id_str) && iter++ < 20) {
        idx = getRandomInt(200);
        if (iter == 20)
            idx = 0;
    }
    Text = await response.data[idx].full_text;
    url = await response.data[idx].id_str;
    tweets.add(url);
    save_data();
    url = `https://twitter.com/fermatslibrary/status/${url}`;
    c.send("`" + Text +"`\nVia: " + url);
    console.log("Sending a fact");
}

async function update() {
    while (channel != NO_CHANNEL && active) {
        send_fact(channel);
        await new Promise(r => setTimeout(r, INTERVAL));
        if (dirty) {
            dirty--;
            return;
        }
    }
}

function stop_run() {
    dirty += (active && channel != NO_CHANNEL);
}

async function get_gender(message) {
    var arguments = message.content.split(" ");
        if (arguments.length > 1) {
            var res = await fetch("https://api.genderize.io?name="+arguments[1]);
            var {name, gender, probability, count} = await res.json();
            gender[0] = gender[0].toUpperCase();

            const Embed = new Discord.MessageEmbed()
            .setColor('#008000')
            .setTitle("Genderize")
            .setDescription("Name: " + name +
            "\nGender: " + gender + "\nProbability: " + String(probability)
            + "\nCount: " + String(count))
            .setFooter("Queried by " + message.member.user.tag.split("#")[0]);

            message.channel.send(Embed);
        }
        console.log("Genderize query by: " + message.member.user.tag);
}

function isNumeric(n) {
    return !isNaN(parseFloat(n)) && isFinite(n);
}

async function get_number(message) {
    arguments = message.content.split(" ");
    if (arguments.length < 2) return;
    if (isNumeric(arguments[1])) {
        arguments[1] = Math.floor(arguments[1]);
        c = 'm';
        if (arguments.length > 2) {
            if (!isNumeric(arguments[2][0]))
                c = arguments[2][0].toLowerCase();
            else {
                c = 0;
                arguments[2] = Math.floor(arguments[2]);
            }
        }
        var res = 0;
        if (c == 'm')
            res = await fetch("http://numbersapi.com/" + arguments[1] + "/math");
        else if (c == 't')
            res = await fetch("http://numbersapi.com/" + arguments[1]);
        else res = await fetch("http://numbersapi.com/" + arguments[1] + "/" + arguments[2] + "/date");
        message.channel.send(await res.text());
    }
    console.log("Number query by: " + message.member.user.tag);
}

function set_interval(message) {
    arguments = message.content.split(" ");
    if (arguments.length < 2 || !isNumeric(arguments[1]))
        return;
    INTERVAL = parseInt(arguments[1])*1000;
    message.channel.send(":white_check_mark: Interval set to " + arguments[1] + ".");
    save_data();
    console.log("Interval set by: " + message.member.user.tag + " to "+INTERVAL.toString());
}

async function update_vids() {
    var temp = VID_INTERVAL;
    VID_INTERVAL = 10000;
    while (true) {
        await new Promise(r => setTimeout(r, VID_INTERVAL));
        if (channel == NO_CHANNEL || !active) {
		VID_INTERVAL = 10000;
		continue;
	}
        VID_INTERVAL = temp;
        update_data();
        VID_INTERVAL = temp;
	for (let channel_id of ytchannels) {
            var response = await fetch(`https://www.googleapis.com/youtube/v3/search?key=${youtubetoken}&channelId=${channel_id}&part=snippet,id&order=date&maxResults=1`);
            if (response.status != 200) {
                console.log(response.status);
                console.log(channel_id);
                continue;
            }
            response = await response.text();
            response = JSON.parse(response);
            var id = response.items[0].id.videoId;
            var date = new Date();
            date = date.toISOString();
            if (!vids.has(id) && date.split('T')[0] == response.items[0].snippet.publishTime.split('T')[0]) {
                channel.send(`https://www.youtube.com/watch?v=${response.items[0].id.videoId}`);
                vids.add(id);
            }
	}
	save_data();
    }
}

function add_channel(message) {
    arguments = message.content.split(" ");
    if (arguments.length > 1) {
        ytchannels.add(arguments[1]);
        message.channel.send(":white_check_mark: Channel ID added successfully.");
    }
    save_data();
    console.log("Add channel query by: " + message.member.user.tag);
}

function remove_channel(message) {
    arguments = message.content.split(" ");
    if (arguments.length > 1 && ytchannels.has(arguments[1]))  {
        ytchannels.delete(arguments[1]);
    } else {
        message.channel.send(":x: Invalid query.");
    }
    save_data();
    console.log("Remove channel query by: " + message.member.user.tag);
}

function forbidden(message) {
    message.channel.send(":x:**" + message.member.user.tag.split("#")[0] + "**, you can't use that.");
}

async function update_problems() {
    while (true) {
        await new Promise(r => setTimeout(r, 30*1000));
        var date = new Date();
        var ar = [], arr = [];
        for (let [k,p] of PROBLEMS) {
            var difference = date.getTime() - p.time.getTime();
            if (difference >= 48 * 3600 * 1000)
                ar.push(k);
        }
        for (let k of ar)
            PROBLEMS.delete(k);
        for (let [k,p] of PENDING_USERS) {
	    var c = new Date(p);
            var difference = date.getTime() - c.getTime();
            if (difference >= 10 * 60 * 1000)
                arr.push(k);
        }
        for (let k of arr)
            PENDING_USERS.delete(k);
        save_data();
    }
}

async function submit_pb(msg) {
    if (PENDING_USERS.has(msg.author.id.toString())) {
        msg.author.send("You can't make more than 1 problem submission request in a 10 minutes window.");
        return;
    }
    if (BUSY) {
        msg.author.send("Another user is in the process of submitting a question/solution, please try again in 1 to 3 minutes.");
        return;
    }

    BUSY = 1;
    if (QUESTIONS_CHANNEL == NO_CHANNEL)
        QUESTIONS_CHANNEL = msg.channel;

    var problem = "**Problem #" + CURID.toString() + ":**\n";
    var init = problem;
    var first_msg = await msg.author.send("Please send all texts and files of your question then send `" + prefix + "done` when you're done or `" + prefix + "abort` to cancel.\nYou're given 2 minutes to complete this.");

    var submit = 0;
    var dm = first_msg.channel;
    let collector = first_msg.channel.createMessageCollector(m => m.author.id === msg.author.id, { time: 120000});
    // console.log(collector)

    collector.on('collect', (message, col) => {
        // console.log(message);
        if (message.content.startsWith(`${prefix}done`)) {
            submit = 1;
            collector.stop();
            return;
        }
        if (message.content.startsWith(`${prefix}abort`)) {
            collector.stop();
            return;
        }
        if (message.content != "")
            problem += message.content + "\n";
        var ar = message.attachments.array();
        for (var i = 0; i < ar.length; i++)
            problem += ar[i].proxyURL + "\n";
    });
    collector.on('end', (c, r) => {
        var date = new Date();
        PENDING_USERS.set(msg.author.id, date);
        if (submit && problem != init) {
            dm.send(":white_check_mark: Question submitted successfully, you've been awarded **30** points.");
            QUESTIONS_CHANNEL.send(problem + "\nFrom: <@" + msg.author.id + ">");
            var up = 0;
            if (POINTS.has(msg.author.id)) {
                up = POINTS.get(msg.author.id);
                POINTS.delete(msg.author.id);
                POINTS.set(msg.author.id,30 + up);
            }
            else POINTS.set(msg.author.id, 30);
            update_role(msg.member, up + 30, msg.guild);
            PROBLEMS.set(CURID++, {time: date, member: msg.author});
        } else dm.send("Cancelled submission.")
        save_data();
        BUSY = 0;
        console.log("Ask query by: " + msg.member.user.tag);
    });
}

async function submit_sol(msg) {
    if (BUSY) {
        msg.author.send("Another user is in the process of submitting a question/solution, please try again in 1 to 3 minutes.");
        return;
    }
    
    BUSY = 1;

    if (QUESTIONS_CHANNEL == NO_CHANNEL)
        QUESTIONS_CHANNEL = msg.channel;
    var arguments = msg.content.split(" ");
    var solution = "**Solution attempt to problem #" + arguments[1] + ":**\n";
    var first_msg = await msg.author.send("Please send all texts and files of your solution then send `" + prefix + "done` when you're done or `" + prefix + "abort` to cancel.\nYou're given 3 minutes to complete this.");

    var dm = first_msg.channel;
    const collector = first_msg.channel.createMessageCollector(m => m.author.id === msg.author.id, { time: 180000});

    var submit = 0;

    collector.on('collect', message => {
        if (message.content.startsWith(`${prefix}done`)) {
            submit = 1;
            collector.stop();
            return;
        }
        if (message.content.startsWith(`${prefix}abort`)) {
            collector.stop();
            return;
        }
        if (message.content != "")
            solution += message.content + "\n";
        var ar = message.attachments.array();
        for (var i = 0; i < ar.length; i++)
            solution += ar[i].proxyURL + "\n";
    });

    collector.on('end', (c, r) => {
        var date = new Date();

        if (submit && solution != "") {
            dm.send(":white_check_mark: Solution submitted successfully, you've been awarded **50** points.");
            solution += "\nBy: <@" + msg.author.id + ">\n<@" + PROBLEMS.get(parseInt(arguments[1])).member.id + ">"; 
            QUESTIONS_CHANNEL.send(solution);
            var up = 0;
            if (POINTS.has(msg.author.id)) {
                up = POINTS.get(msg.author.id);
                POINTS.delete(msg.author.id);
                POINTS.set(msg.author.id,50 + up);
            }
            else POINTS.set(msg.author.id, 50);
            update_role(msg.member, up + 50, msg.guild);
        } else dm.send("Cancelled submission.")

        save_data();
        BUSY = 0;
        console.log("Submit query by: " + msg.member.user.tag);
    });
}

function check_ban(message) {
    return BANNED.has(message.author.id);
}
 
client.once('ready', () => {
    console.log("Bot running.");
    update_data();
    client.user.setActivity(`${prefix}help`);
});

client.once('ready', () => {
    update_problems();
});

client.once('ready', () => {
    update_vids();
});

client.once('ready', () => {
    update();
});




client.on('message', message => {
    if (check_ban(message) || message.author.bot) return;
    // BEGIN HELP
    if (message.content.startsWith(`${prefix}help`)) {
        var temp = "`";
        message.channel.send("A brief description and guide on how to use me was sent to your DMs!");
        message.author.send("Commands:\n"+temp+temp+temp+
        prefix+"mkroles             -- sets roles channel and adds emojis from the source file\n\n"+
        prefix+"setpostchannel      -- sets the channel where posts will be made\n\n"+
        prefix+"enablepost          -- enables auto posts in postchannel\n\n"+
        prefix+"disablepost         -- disables auto posts\n\n"+
        prefix+"setpostinterval x   -- sets the interval between 2 posts to x seconds\n\n"+
        prefix+"post                -- replies with a random post\n\n"+
        prefix+"setquestionschannel -- sets the channel where submitted problems will be posted\n\n"+
        prefix+"say sentence        -- repeats sentence\n\n"+
        prefix+"ask                 -- starts the problem submission process\n\n"+
        prefix+"submit id           -- starts the solution submission process for problem #id\n\n"+
        prefix+"score @user         -- shows user's server score\n\n"+
        prefix+"addscore @user x    -- adds x to user's server score\n\n"+
        prefix+"yt title            -- searches for title on youtube\n\n"+
        prefix+"addyt channel_id    -- adds youtube channel with id channel_id to the list of youtube channels to get posts from\n\n"+
        prefix+"removeyt channel_id -- removes youtube channel with id channel_id from the list of youtube channels to get posts from\n\n"+
        prefix+"number x            -- replies with a math fact about number x\n\n"+
        prefix+"number x t          -- replies with a general fact about number x\n\n"+
        prefix+"number m d          -- replies with an event that happened on the d-th of m\n\n"+
        temp+temp+temp)
    }
    // END HELP
    if (!message.channel.guild) return;
    if (message.content.startsWith(prefix + "setpostchannel") 
    && message.member.hasPermission('MANAGE_CHANNELS')) {
        stop_run();
        message.channel.send(":white_check_mark: Channel set to " + message.guild.channels.cache.get(message.channel.id).toString()) + ".";
        channel = message.channel;
        save_data();
	    update();
    } else if (message.content.startsWith(prefix + "setpostchannel")) {
        forbidden(message);
    } else if (message.content.startsWith(prefix + "setquestionschannel") 
    && message.member.hasPermission('MANAGE_CHANNELS')) {
        message.channel.send(":white_check_mark: Questions channel set to " + message.guild.channels.cache.get(message.channel.id).toString()) + ".";
        QUESTIONS_CHANNEL = message.channel;
        save_data();
    } else if (message.content.startsWith(prefix + "setquestionschannel")) {
        forbidden(message);
    } else if (message.content == prefix + "enablepost") {
        if (channel == NO_CHANNEL) {
            message.channel.send(":x: Please set the channel first using `" + prefix + "setpostchannel`.");
            return;
        } else message.channel.send(":white_check_mark: Enabled in " +  message.guild.channels.cache.get(channel.id).toString() + ".");
        if (active) return;
        active = 1;
        save_data();
        update();
    } else if (message.content == prefix + "disablepost") {
        stop_run();
        message.channel.send(":no_entry_sign: Disabled.");
        active = 0;
        save_data();
    } else if (message.content.startsWith(`${prefix}setpostinterval`)
    && message.member.hasPermission('MANAGE_CHANNELS')) {
        set_interval(message);
        save_data();
        stop_run();
        update();
    } else if (message.content.startsWith(`${prefix}setpostinterval`)) {
        forbidden(message);
    } else if (message.content == prefix + "post") {
        send_fact(message.channel);
        console.log("Post query by: " + message.member.user.tag);
    } else if (message.content.startsWith(prefix + "gender")) {
        get_gender(message);
    } else if (message.content.startsWith(prefix + "number")) {
        get_number(message);
    } else if (message.content.startsWith(`${prefix}yt`)) {
        var arguments = message.content.split(" ");
        var title = "";
        if (arguments.length >= 2) {
            for (var i = 1; i < arguments.length; i++)
                title = title + arguments[i] + " "; 
            youtube(title, opts, function(err, results) {
                if(err) return console.log(err);
                message.channel.send(results[0].link);
            });
        }
        console.log("YouTube search query by: " + message.member.user.tag);
    } else if (message.content.startsWith(`${prefix}addyt`)
    && message.member.hasPermission('MANAGE_CHANNELS')) {
        add_channel(message);
    } else if (message.content.startsWith(`${prefix}addyt`)) {
        forbidden(message);
    } else if (message.content.startsWith(`${prefix}removeyt`)
    && message.member.hasPermission('MANAGE_CHANNELS')) {
        remove_channel(message);
    } else if (message.content.startsWith(`${prefix}removeyt`)) {
        forbidden(message);
    } else if (message.content.startsWith(prefix + "mkroles")
    && message.member.hasPermission('MANAGE_ROLES')
    && message.member.hasPermission('MANAGE_CHANNELS')) {
        if (!message.channel.guild) return;
        react(message);
        ROLES_CHANNEL = message.channel;
        save_data();
        message.channel.messages.fetch();
    } else if (message.content.startsWith(prefix + "mkroles")) {
        forbidden(message);
    } else if (message.content.startsWith(`${prefix}say`)
    && message.member.hasPermission('MANAGE_ROLES')
    && message.member.hasPermission('MANAGE_CHANNELS')
    && message.member.hasPermission("BAN_MEMBERS")) {
        var arguments = message.content.split(" ");
        var resp = "";
        for (var i = 1; i < arguments.length; i++) {
            resp += arguments[i];
            if (i+1 < arguments.length)
                resp += " ";
        }
	if (resp != "")
            message.channel.send(resp);
        console.log("Say query by: " + message.member.user.tag);
    } else if (message.content.startsWith(`${prefix}say`)) {
        forbidden(message);
    } else if (message.content.startsWith(`${prefix}ask`)) {
        message.channel.send("A message has been sent to your DMs!");
        submit_pb(message);
    } else if (message.content.startsWith(`${prefix}submit`)) {
        var arguments = message.content.split(" ");
        if (arguments.length < 2) {
            message.channel.send(":x: Missing argument.");
            return;
        }
        if (!isNumeric(arguments[1]) || !PROBLEMS.has(parseInt(arguments[1]))) {
            message.channel.send(":x: Inexistent problem.");
            return;
        }
        message.channel.send("A message has been sent to your DMs!");
        submit_sol(message);
    } else if (message.content.startsWith(`${prefix}ignore`)
    && (message.member.hasPermission("BAN_MEMBERS") 
    || message.member.user.tag == "Froopie#1304")) {
        BANNED.add(message.mentions.users.first().id);
        save_data();
        console.log("Banned " + message.mentions.users.first().tag);
    } else if (message.content.startsWith(`${prefix}unignore`)
    && (message.member.hasPermission("BAN_MEMBERS") 
    || message.member.user.tag == "Froopie#1304")) {
        if (BANNED.has(message.mentions.users.first().id))
            BANNED.remove(message.mentions.users.first().id);
        save_data();
        console.log("Unbanned " + message.mentions.users.first().tag);
    } else if (message.content.startsWith(`${prefix}score`)) {
        var person = message.author;
        var tag = person.tag;
        if (message.mentions.members.first()) {
            person = message.mentions.members.first();
            tag = person.user.tag;
        }
        if (!POINTS.has(person.id))
            POINTS.set(person.id, 0)
        message.channel.send(tag.split("#")[0] + "'s score is: **" 
        + POINTS.get(person.id).toString() + "**");
        console.log("Score query by: " + message.member.user.tag);
    } else if (message.content.startsWith(`${prefix}addscore`)
            && message.member.hasPermission('MANAGE_ROLES')) {
        var arguments = message.content.split(" ");
        if (message.mentions.members.first() && arguments.length > 2 && isNumeric(arguments[2])) {
            if (!POINTS.has(message.mentions.members.first().id))
                POINTS.set(message.mentions.members.first().id, 0);
            var up = POINTS.get(message.mentions.members.first().id);
            POINTS.delete(message.mentions.members.first().id);
            POINTS.set(message.mentions.members.first().id,parseInt(arguments[2]) + up);
            message.channel.send("Added **" + arguments[2] + "** points to " + message.mentions.members.first().user.tag.split("#")[0]+".");
            save_data();
            update_role(message.mentions.members.first(), up+parseInt(arguments[2]), message.guild);
        }
        else message.channel.send(":x: Wrong format.");
        console.log("Score add query by: " + message.member.user.tag);
    } else if (message.content.startsWith(`${prefix}addscore`)) {
        forbidden(message);
    }
});

client.on("messageReactionAdd", async (e, n) => {
    if (n && !n.bot && e.message.channel == ROLES_CHANNEL) {
            for (let o in emojiname) {
                if (e.emoji.name == emojiname[o]) {
                    let i = e.message.guild.roles.cache.find(e => e.name == rolename[o]);
                    e.message.guild.member(n).roles.add(i).catch(console.error)
                }
            }
        }
});

client.on("messageReactionRemove", async (e, n) => {
    if (n && !n.bot && e.message.channel.guild && ROLES_CHANNEL != NO_CHANNEL 
        && e.message.channel == ROLES_CHANNEL) {
            for (let o in emojiname)
                if (e.emoji.name == emojiname[o]) {
                    let i = e.message.guild.roles.cache.find(e => e.name == rolename[o]);
                    e.message.guild.member(n).roles.remove(i).catch(console.error)
                }
        }
});

process.on('uncaughtException', (err) => {
    console.log(err);
});

client.login(token);
