
var Bot = require('./bot/nodebot').NodeBot,
    sys = require('sys');

var bot = new Bot('./config_qnet.json');

bot.debug = true;

bot.connect();


GLOBAL.bot = bot;
require('repl').start('nodeirc>');

