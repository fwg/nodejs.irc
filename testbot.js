// ok, bot/bot/bot is probably not the best naming scheme, subject to change
var Bot = require('./bot/bot').Bot,
    sys = require('sys');

// we do not give a nick, nor user nor realname, the client will 
// pick a semi-random nick and 'guest' as user/realname.
var config = {host: "localhost", port: 6667, nick: ""};

var bot = new Bot(config);

var testChannel = '#test';

// this function will handle messages in which our nick occurs.
// the response is dumb, but hey, it is even funny sometimes.
// trigger callbacks get a user object, a channel object and a message,
// the last we do not care about.
function sayHello(from, channel){
    channel.msg('hello ' + from.name);
}

// it is as simple as this to listen to a specific combination of characters.
// if anyone mentions our name, we say hello
bot.addTrigger(new bot.Trigger(bot.nick).addCallback(sayHello), [testChannel]);

// we will get all messages in and out printed to the screen, to see what is going on
bot.debug = true;

bot.connect();

// when the bot is connected, we join
bot.addListener('001', function(){
    // the callback gets the channel object of the joined channel
    bot.join(testChannel).addCallback(function(chan){
        chan.msg('bleeargh');
    });
});
