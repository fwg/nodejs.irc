var C = require('../irc/client'),
    U = require('./user'),
    file = require('posix'),
    sys = require('sys');

/**
 * the bot class can be used to define a bot/service.
 * @see Bot.prototype.initialize
 */
var Bot = exports.Bot = function Bot(config){
    this.initialize(config);
}; 

sys.inherits(Bot, C.Client);

/**
 * the object initialization
 * @param config path to a json configuration file.
 *               See the config.json.annotated.txt for more info.
 *               See Client for the parameters to the client.
 *               See the modules for their parameters.
 * @throws Error if file does not exist or could not be parsed.
 */
Bot.prototype.initialize = function initialize(config){
    try{
      var c = JSON.parse(file.cat(config).wait());
    }catch(e){
      throw new Error(config+":"+e.message);
    }

    Bot.super_.initialize.call(this, c.host, c.port, c.nick, c.user, c.realname);

    this._config = c;
    this._modules = {};

    this._triggers = {};
    this._triggers.PRIV = [];
    this._triggers['*'] = [];

    // load initial modules
    try{
      this.load(c.autoload).wait();
    }catch(e){
      sys.puts(e.message);
      process.exit(1);
    }

    // dispatch does all the fun
    this.addListener("PRIVMSG", this.dispatch);

    // join configured channels
    var bot = this;
    var chansWithKey = [], chansWithoutKey = [], keys = [];
    for(var i=0, chans=c.autojoin, chan, l=chans.length; i<l; i++){
        chan = chans[i];
        if(c.channels[chan] && c.channels[chan].key){
            chansWithKey.push(chan);
            keys.push(c.channels[chan].key);
            continue;
        }
        chansWithoutKey.push(chan);
    }
    this.addListener("001", function(){
        bot.join(chansWithKey.concat(chansWithoutKey), keys);
    });
};

/**
 * return the module object
 * @param name 
 * @param obj optional object to set to.
 */
Bot.prototype.module = function module(name, obj){
    if(!this._modules[name] || obj){
        return this._modules[name] = obj || {};
    }
    return this._modules[name];
};


var groups = [];
groups.dirtyTime = new Date(); // timestamp when last a group was added
// yes, make sexy time. dirty dirty. FIXME facetious variable name!! 
//
// NOT!

/**
 * create and/or store a group or create a user object.
 * @param name can be a nickname or a mask maybe with * wildcard or a regex, preferably 
 *             with i modifier.
 * @return a user object if given a nick or complete mask, else a regex
 */
Bot.prototype.group = function group(name){
    var regex;
    if(!(name instanceof RegExp)){
        if(name.indexOf('*')!==-1){
            name = name.toLowerCase();
            // create a mask regex 
            name = "^" + name.replace(/([^\w*])/g,'\\$1').replace(/\*/g, '.*?') + "$";
            regex = new RegExp(name, "i");
            groups["/"+name+"/i"] = regex;
            name = regex;
        }else{
            return this.user(name);
        }
    }
    if(!name.ignoreCase){
        name = name.toString().match(/^\/(.*?)\/\w*$/)[1];
        regex = new RegExp(name, "i");
        groups["/"+name+"/i"] = regex;
        name = regex;
    }
    groups.push(name);
    groups.dirtyTime = new Date();
    return name;
}

/**
 * load one or more modules. aborts in case of an error so load is guaranteed to be in order.
 * @param names modules string or array of strings that are paths below config.mouldedir
 * @return promise when all of the modules are loaded
 */
Bot.prototype.load = function load(names){
    names = names instanceof Array ? names : [names];

    var p = this._promiseGiver.create(),
        bot = this;
    var i = 0, l = names.length - 1;
    
    if(this.debug)p.debug = "load "+names.toString();

    function loadone(module){
        var name = names[i];
        try{
            var module = process.compile("(function(Bot, options){"+
                    module+
                    "})", name);
            module = module(bot, bot._config.modules[name]);
            bot.module(name, module);
        }catch(e){
            return p.emitError(e);
        }

        if(i < l){
            i++;
            file.cat(bot._config.moduledir+'/'+names[i]+'.js')
                .addErrback(error)
                .addCallback(loadone);
        }else{
            p.emitSuccess();
        }
    }
    function error(e){
        p.emitError(e);
    }

    file.cat(this._config.moduledir+'/'+names[i]+'.js')
        .addErrback(error)
        .addCallback(loadone);

    return p;
};

/**
 * check if a module has been loaded
 */
Bot.prototype.isLoaded = function isLoaded(name){
    return !!this._modules[name];
}

/**
 * dispatch looks for a trigger to apply.
 */
Bot.prototype.dispatch = function dispatch(from, channel, msg){
    // build trigger from msg
    // private conversation
    if(!/^#/.test(channel.name)){
        for(var i=0, t; t = this._triggers.PRIV[i]; i++){
            if(t.trigger.test(msg)) break;
        }
    }else if(this._triggers[channel.name]){
        for(var i=0, ts=this._triggers[channel.name]; t = ts[i]; i++){
            if(t.trigger.test(msg)) break;
        }
    }else{
        for(var i=0, ts=this._triggers['*']; t = ts[i]; i++){
            if(t.trigger.test(msg)) break;
        }
    }
    if(!t){
        return;
    }

    from = this.user(from);

    if(this.checkPermission(t, channel, from)){
        t.emit("match", from, channel, msg);
    }
};

/**
 * check if a user has sufficient rights to execute the command
 * @param cmd command object, e.g a trigger.
 * @param channel the channel object
 * @param user the user object
 */
Bot.prototype.checkPermission = function checkPermission(cmd, channel, user){
    var rules = this._denyRules[channel.name];
    if(rules){
        rules = rules[cmd.id];
        if(rules && user.match(rules)){
            return false;
        }
    }
    rules = this._allowRules[channel.name];
    if(rules){
        rules = rules[cmd.id];
        if(rules && user.match(rules)){
            return true;
        }
    }
    return false;
};

/**
 * add a deny rule
 * @param cmd     the trigger/command/whatever that is being accessed
 * @param channel the channel object this is anticipated to happen on
 * @param group   group/user or argument for Bot.prototype.group
 */
Bot.prototype.addDenyRule = function addDenyRule(cmd, channel, group){
    user = this.group(group);
    channel = this.channel(chanel);

    var rules = this._denyRules[channel.name];
    if(!rules[cmd.id]){
        rules[cmd.id] = [group];
    }else{
        rules[cmd.id].push(group); 
    }
    return this;
};

/**
 * add an allow rule
 * @param cmd     the trigger/command/whatever that is being accessed
 * @param channel the channel object this is anticipated to happen on
 * @param user    user object or string or userlevel
 */
Bot.prototype.addAllowRule = function addAllowRule(cmd, channel, user){
    user = this.user(user);
    channel = this.channel(chanel);

    var rules = this._allowRules[channel.name];
    if(!rules[cmd.id]){
        rules[cmd.id] = [user];
    }else{
        rules[cmd.id].push(user); 
    }
    return this;
};

/**
 * a Trigger can be used to register an action that is executed when the bot encounters a
 * specific message on a channel.
 * use var t = bot.Trigger(...).addCallback(function);
 * add triggers from most specific to least specific. else the follwing happens:
 * Trigger("!+ ","*")
 * Trigger("!admin "*")
 * the second will never be recognized, because the first one matches before it.
 * @param trigger  either a string or a regex. the string may conatain the wildcards * for any
 *                 number of characters, + for one or more and ? for one character.
 *                 so "`+ * becomes /`.+? .*?/.
 * @param channels an array of the channels that the trigger will be available in. 
 *                 the special channel "PRIV" is used for queries.
 *                 this does not collide with a potential user named PRIV. his channel
 *                 would be "priv".
 *                 the special channel '*' means any channel.
 */
var triggercounter = 0;
var Trigger = Bot.prototype.Trigger = function Trigger(trigger, channels){
    if(!(this instanceof Trigger)){
        var t = new Trigger(trigger);
        for(var i=0, channel; channel = channels[i]; i++){
            if(!this._triggers[channel])this._triggers[channel] = [];
            this._triggers[channel].push(t);
        }
        return t;
    }

    if(!(trigger instanceof RegExp)){
        trigger = new RegExp(trigger.replac(/\?/g,".?").replace(/(\*|\+)|/g,".$1?"));
    }

    this.trigger = trigger;
    this.id = "trigger"+(triggercounter++);
};
sys.inherits(Trigger, process.EventEmitter);

Trigger.prototype.addCallback = function (f){
    this.addListener("match", f);
};

/**
 * if the i18n object has a translation it is returned. chain yout own i18n obj with
 * the bot i18n with obj.prototype = Bot.i18nObj
 * @param l10n the i18n object
 * @param string
 * @param 
 */
Bot.prototype.i18n = function i18n(l10n, string, locale){
    var transl;
    if(transl = l10n[string][this.locale] && typeof transl.valueOf() === 'string')
        return transl.valueOf();
    return string;
};

Bot.prototype.i18nObj = {
    'and':{de:'und'}
};
