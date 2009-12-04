/**
 * the commands module lets the bot react to messages like bot: reset or bot: kick somebody..
 * the options are:
 *   trigger: what beginning of a msg should mark a command.
 *            can be a "regex", e.g. "/\\![abc]/i", 
 *            other string for /^<string>(?: |:)/ or null/undefined for /^<nick>(?: |:)/i
 *            it will be used to extract the command from msg, so msg.replace(trigger, "") must
 *            yield the command.
 *
 * you specify commands by returning a named group back from you module, containing a 'commands'
 * property that is an array of ["command", function] tuples.
 * commands may either be a "regex"-string, like "/x/g", mind that \ have to be double, 
 * or be string that may contain + or * that will be replaced with ([^ ]+) and (.*) respectively,
 * while all other non-word characters will be escaped with \ . commands are case insensitive by
 * default, regexes do not have to be.
 * if the command is not a regex with g flag, parameters to the callback are
 * from(user object), channel(object), cmd(full command), submatch 1, submatch 2, etc
 * else its all the matches returned by cmd.match(command).
 */

var sys = require('sys');

var i18n = {
    'unknown command':{de_DE:'unbekannter befehl'}
};
Bot.i18n.add(i18n);

var trigger;
var matches;
if(options.trigger == null){
    trigger = new RegExp("^"+Bot.nick+"(?: |:)", "i");
}else if(matches = options.trigger.match(/\/(.+?)\/([igm]*)/)){
    trigger = new RegExp(matches[1], matches[2]);
}else{
    trigger = new RegExp("^"+options.trigger.replac(/\W/g,'\\$&')+"(?: |:)");
}

trigger = new Bot.Trigger(trigger);

var commands = [];
process.cmds = commands;

// find the command to execute
function command(from, channel, msg){
    var command = msg.replace(trigger.trigger, '');
    command = command.replace(/^\s+/,'');
    var matches;
    for(var i=0, c; c=commands[i]; i++){
        if(matches = command.match(c.cmd)){
            if(!c.cmd.global) matches = matches.slice(1);
            c.emit.apply(c, ["match", from, channel, command].concat(matches));
        }
    }
}

// handle commands for modules
function _commandHandler(module, name, commands){
    var cmd;
    for(var i=0, c; c=commands[i]; i++){
        c = addCommand(c[0], c[1]);
        Bot.actionGroup(module+'.'+name).push(c);
    }
} 

/**
 * add a command that calls function func
 */
function addCommand(cmd, func){
    cmd = new Command(cmd);
    commands.push(cmd);
    return cmd.addCallback(func);
}

Bot.registerModPropHandler('commands', _commandHandler);

//
// the command class
//

var memo = {};
// the Command, emits "match"
function Command(cmd){
    var s = cmd.toString();
    if(memo[s]) return memo[s];
    var matches;
    if(matches = cmd.match(/\/(.+?)\/([igm]*)/)){
      this.cmd = new RegExp(matches[1], matches[2]);
    }else{
      this.cmd = new RegExp("^"+cmd.replace(/[^\w+*]/g, "\\$&")
                    .replace(/\+/g, "([^ ]+)").replace(/\*/g, '(.*)')+"$","i");
    }

    this.id = "command|"+s;
    memo[s] = this;
}

require('sys').inherits(Command, process.EventEmitter);

Command.prototype.addCallback = function addCallback(func){
    this.addListener("match", func);
    return this;
};

//
// module object
//
trigger.addCallback(command);
return {'invoke':{triggers:[trigger]},
    addCommand: addCommand};

