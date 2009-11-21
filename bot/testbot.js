
var Bot = require('./bot').Bot,
    sys = require('sys');

var bot = new Bot('./config.json');

bot.debug = true;

bot.connect();
bot.addListener('001',function(){
    bot.join("#SS", function(chan){
        chan.msg('meine oma und du');
    });
});

process.bot = bot;
require('repl').start('nodeirc>');

