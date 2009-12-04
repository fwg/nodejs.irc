
var Bot = require('./bot/bot').Bot,
    sys = require('sys');

var bot = new Bot('./config_qnet.json');

bot.debug = true;

bot.connect();


GLOBAL.bot = bot;
require('repl').start('nodeirc>');

