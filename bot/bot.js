var Client = require('../irc/client').Client,
    file = require('posix'),
    sys = require('sys');

/**
 * the bot class can be used to define a bot/service.
 * @see Bot.prototype.initialize
 */
var Bot = exports.Bot = function Bot(config){
    this.initialize(config);
}; 

sys.inherits(Bot, Client);

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
    this._modules = [];

    this._triggers = {};
    this._triggers.PRIV = [];
    this._triggers['*'] = [];

    this._users = {};

    // load initial modules
    this.load(c.autoload);
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

/**
 * identifying a user
 * @param nick the nickname
 * @param mask a full mask
 */
function User(nick, mask){
    this.nick = nick;
    this.name = mask.match(/(.+?)!.+?\@.+?/)[1];
    this.mask = mask;
    this.level = 1;

    this.groups = [];
    this.groups.lastChecked = 0;
}

/**
 * function that searches for matches in the rules
 */
User.prototype.match = function match(rules){
    // check which groups we are in
    // if there are different groups than last time we checked
    var g = this.groups;
    if(groupsDirtyTime > g.lastChecked){
        var m = this.mask;
        g.splice(0);
        for(var i=0, group; group = groups[i]; i++){
            if(group.test(m)) g.push(group);
        }
        this.groups.lastChecked = new Date();
    }
    // now check rules for either us or one of the groups
    for(var i=0, rule; rule = rules[i]; i++){
        if(rule === this || this.groups.indexOf(rule)!==-1)
            return true;
    }
};

var groups = [];
var groupsDirtyTime; // timestamp when last a group was added
// yes, make sexy time. dirty dirty. FIXME facetious variable name!! 
//
// NOT!

/**
 * @param name can be a nickname or a mask maybe with * wildcard or a regex
 * @return a user object that identifies a user or a regex for more users
 */
Bot.prototype.user = function user(name){
    // already a user obj
    if(name.name) return name;
    // preserve with case for later pass on to User
    var n = name;

    if(!(name instanceof RegExp)){
        name = name.toLowerCase();
        if(name.indexOf('!')===-1){ // just a nickname
            return this._users[name] || (this._users[name] = new User(name, n+"!.@."));
        }else if(name.indexOf('*')!==-1){
            // push a mask regex 
            name = new RegExp("^"+
                name.replace(/(\.|\@|\!)/g,'\\$1')
                    .replace(/\*/g, '.*?')
                +"$"
            );
            groups.push(name);
            groupsDirty = new Date();
        }else{
            // full mask provided 
            var nick = name.match(/(.+?)!.+?\@.+?/)[1];
            if(!nick) throw new TypeError("Incomplete mask: "+name);
            var obj = this._users[nick];
            // likely by message from server so update the name from n
            if(obj) obj.name = n.match(/(.+?)!.+?\@.+?/)[1];
            return obj || (this._users[nick] = new User(nick, n));
        }
    }else{
        groups.push(name);
        groupsDirty = new Date();
    }
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
            file.cat(bot._config.moduldedir+'/'+names[i]+'.js').addCallback(loadone);
        }else{
            p.emitSuccess();
        }
    }

    file.cat(this._config.moduledir+'/'+names[i]+'.js').addErrback(function(){
            sys.puts("module "+names[i]+" could not be loaded");
        }).addCallback(loadone);

    return p;
};

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
    if(!t){
        return;
    }

    if(this.checkPermission(t, channel, this.user(from))){
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
 * @param user    user object or string that is passed on to Bot.prototype.user
 */
Bot.prototype.addDenyRule = function addDenyRule(cmd, channel, user){
    user = this.user(user);
    channel = this.channel(chanel);

    var rules = this._denyRules[channel.name];
    if(!rules[cmd.id]){
        rules[cmd.id] = [user];
    }else{
        rules[cmd.id].push(user); 
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

