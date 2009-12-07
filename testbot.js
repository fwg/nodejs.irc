var Bot = require('./bot/bot').Bot,
    sys = require('sys');

// we do not give a nick, nor user nor realname, the client will 
// pick a semi-random nick and 'guest' as user/realname.
var config = {host:"irc.freenode.net", port:6667, nick:""};

var bot = new Bot(config);

function sayHello(from, channel){

// we will get all messages on stdout
bot.debug = true;

bot.connect();


GLOBAL.bot = bot;
require('repl').start('nodeirc>');

