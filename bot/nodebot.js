var B = require('./bot'),
    U = require('./user'),
    file = require('posix'),
    sys = require('sys'),
    GT = require('../util/gettext'),
    S = require('../util/kvstore');
    
/**
 * advanced bot class that uses modules to implement functionality,
 * has fine grained permission management, a key/value store for persistence,
 * and l10n support through a minimal gettext impl.
 * @see NodeBot.prototype.initialize
 */
var NodeBot = exports.NodeBot = function NodeBot(config) {
    this.initialize(config);
};

sys.inherits(NodeBot, B.Bot);

/**
 * object initialization
 * @param config path to a json configuration file.
 *               See the config.json.annotated.txt for more info.
 *               See the modules for their parameters.
 * @see Bot.initialize
 * @throws Error if config file does not exist or could not be parsed as JSON.
 */
NodeBot.prototype.initialize = function(config) {
    try{
      var c = JSON.parse(file.cat(config).wait());
    }catch(e){
      throw new Error(config+":"+e.message);
    }
    NodeBot.super_.initialize.call(this, c);
    
    this._config = c;
    this._modules = {};

    this._denyRules = {};
    this._allowRules = {};

    var bot = this;

    this._mpHandlers = {triggers:[function(){bot._triggerHandler.apply(bot, arguments)}]};

    this._actionGroups = {};

    // load storage
    this.store = new S.Store;
    try{
      this.store.load(c.botstorage).wait();
    }catch(e){
      // we don't care if file is not there, it will be created when we save 
    }
    setInterval(function(){bot.store.save(c.botstorage);}, c["autosave-interval"]);

    // load locale strings
    var i18n;
    this.i18n = new GT.Gettext;
    if(i18n = this.store.get('i18n')){
        this.i18n._maps = i18n._maps;
        this.i18n._locale = i18n._locale;
    }
    this.store.put('i18n', this.i18n);
    
    // load initial modules
    try{
      this.load(c.autoload).wait();
    }catch(e){
      sys.puts(e.message);
      sys.puts(e.stack);
      process.exit(1);
    }
    
    // add deny/allow rules from config
    var rules, grp;
    for(var channel in c.channels){
        if(rules = c.channels[channel].allow){
            for(var i=0,r; r=rules[i]; i++){
                if(r.length != 2) throw new Error('allow rules for '+channel+' are erroneous');
                grp = this.actionGroup(r[0]);
                if(!grp.length) continue;
                for(var j=0,g; g=grp[j]; j++){
                    this.addAllowRule(g, channel, r[1]);
        }   }   }
        if(rules = c.channels[channel].deny){
            for(var i=0,r; r=rules[i]; i++){
                if(r.length != 2) throw new Error('deny rules for '+channel+' are erroneous');
                grp = this.actionGroup(r[0]);
                if(!grp.length) continue;
                for(var j=0,g; g=grp[j]; j++){
                    this.addDenyRule(g, channel, r[1]);
        }   }   }
    }

    this.addListener("PRIVMSG", this.dispatch);
    
    // join configured channels
    var chansWithKey = [], chansWithoutKey = [], keys = [];
    // channels wirh configured key come first so the multi-join command works
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
 * dispatch looks for a trigger to apply.
 */
NodeBot.prototype.dispatch = function dispatch(from, channel, msg){
    channel = this.channel(channel);
    var triggers = this.findTrigger(channel, msg);
    if(!triggers.length) return;
    
    from = this.user(from);

    for(i=0; t=triggers[i]; i++){
        if(this.checkPermission(t, channel, from)){
            t.emit("match", from, channel, msg);
        }else{
            channel.msg(from.name+": not enough rights to do this");
        }
    }
};

/**
 * return the module object of module <name>
 * @param name 
 * @param [obj] object to set to.
 */
NodeBot.prototype.module = function module(name, obj){
    if(!this._modules[name] || obj){
        return this._modules[name] = obj || {};
    }
    return this._modules[name];
};


/**
 * an action group consists of objects with a property 'id' that will be used for
 * a allow/deny rule.
 */
NodeBot.prototype.actionGroup = function actionGroup(name){
    name = name.toString().toLowerCase();
    if(!this._actionGroups[name]){
        return this._actionGroups[name] = [];
    }
    return this._actionGroups[name];
};

var groups = [];
exports.groups = groups;
groups.dirtyTime = new Date(); // timestamp when last a group was added
// yes, make sexy time. dirty dirty. FIXME facetious variable name!! 
//
// NOT!

/**
 * create and/or store a group or create a user object.
 * @param match can be a nickname or a mask maybe with * wildcard or a regex, preferably 
 *              already with i modifier.
 * @return a user object if given a nick or complete mask, else a regex
 */
NodeBot.prototype.group = function group(match){
    var name = match.toString().toLowerCase(), regex;
    if(groups[name]) return groups[name];

    if(!(match instanceof RegExp)){
        if(match.indexOf('*')!==-1){
            // create a mask regex 
            regex = "^" + name.replace(/([^\w*])/g,'\\$1').replace(/\*/g, '.*?') + "$";
            regex = new RegExp(regex, "i");
        }else{
            return this.user(match);
        }
    }else{
        if(!regex.ignoreCase){
            regex = name.match(/^\/(.*?)\/\w*$/)[1];
            regex = new RegExp(regex, "i");
        }else{
            regex = match;
        }
    }
    regex.name = name;
    groups.push(regex);
    groups[name] = regex;
    groups.dirtyTime = new Date();
    return regex;
}

var loading = false;
/**
 * load one or more modules. aborts in case of an error so load is guaranteed to be in order.
 * @param names modules string or array of strings that are paths below config.mouldedir
 * @return promise when all of the modules are loaded
 */
NodeBot.prototype.load = function load(names){
    if(loading) throw new Error("load can not be called from modules");

    names = names instanceof Array ? names : [names];
    var bot = this;

    // filter only not loaded modules
    names.filter(function(x){return !bot.isLoaded(x)});

    var i = 0, l = names.length - 1;
    var p = this._promiseGiver.create();
    if(l<i){
        setTimeout(function(){
            p.emitSuccess();
          }, 0);
        return p;
    }
    
    if(this.debug)p.debug = "load "+names.toString();

    function loadone(module){
        var name = names[i];
        try{
            loading = true; // we don't want modules to call load
            var module = process.compile("(function(require, Bot, options){"+
                    module+
                    "})", "module "+name);
            module = module(require, bot, bot._config.modules[name] || {});
            loading = false;
            bot.module(name, module);
            for(var prop in module){
                for(var q in module[prop]){
                    var o = module[prop][q];
                    bot._handleModProp(q, name, prop, o);
                }
            }
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
NodeBot.prototype.isLoaded = function isLoaded(name){
    return !!this._modules[name];
}

//
// permission management
//

/**
 * check if a user has sufficient rights to execute the command
 * @param cmd command object, e.g a trigger.
 * @param channel the channel object
 * @param user the user object
 */
NodeBot.prototype.checkPermission = function checkPermission(cmd, channel, user){
    var allowbygroup, denybygroup;
    var rules = this._denyRules[channel.name];
    if(!/^[+#!&]/.test(channel.name)){
        process.mixin(rules || (rules = {}), this._denyRules['PRIV'] || {});
    }else{
        process.mixin(rules || (rules = {}), this._denyRules['*'] || {});
    }
    if(rules){
        if(rules = rules[cmd.id]){
            user.maybeUpdateGroups(groups);
            // now check rules for either user or one of the groups
            for(var i=0, rule; rule = rules[i]; i++){
                if(rule === user){
                    return false;
                }
                if(user.groups.indexOf(rule)!==-1){
                    denybygroup = true;
                    break;
                }
            }
        }
    }
    rules = this._allowRules[channel.name];
    if(!/^[+#!&]/.test(channel.name)){
        process.mixin(rules || (rules = {}), this._allowRules['PRIV'] || {});
    }else{
        process.mixin(rules || (rules = {}), this._allowRules['*'] || {});
    }
    if(rules){
        if(rules = rules[cmd.id]){
            user.maybeUpdateGroups(groups);
            // now check rules for either user or one of the groups
            for(var i=0, rule; rule = rules[i]; i++){
                if(rule === user){
                    return true;
                }
                if(user.groups.indexOf(rule)!==-1){
                    allowbygroup = true;
                    break;
                }
            }
        }
    }
    return (denybygroup || !allowbygroup) ? false : true;
};

/**
 * add a deny rule
 * @param cmd     the trigger/command (whatever with an id prop) that is being accessed
 * @param channel the channel (object) this is anticipated to happen on
 * @param group   @ for ops, + for voice, group/user or argument for Bot.group
 */
NodeBot.prototype.addDenyRule = function addDenyRule(cmd, channel, group){
    if(group !== "@" && group !== "+"){
        group = this.group(group);
    }
    !channel.name || (channel = channel.name);

    var rules = this._denyRules[channel];
    if(!rules) rules = this._denyRules[channel] = {};
    if(!rules[cmd.id]){
        rules[cmd.id] = [group];
    }else{
        rules[cmd.id].push(group); 
    }
    return this;
};

/**
 * remove a deny rule
 * @param cmd     the trigger/command (whatever with an id prop) that is being accessed
 * @param channel the channel (object) this is anticipated to happen on
 * @param group   @ for ops, + for voice, group/user or argument for Bot.group
 */
NodeBot.prototype.remDenyRule = function remDenyRule(cmd, channel, group){
    if(group !== "@" && group !== "+"){
        group = this.group(group);
    }
    !channel.name || (channel = channel.name);

    var rules = this._denyRules[channel];
    if(!rules) return this;
    if(!rules[cmd.id]){
        return this;
    }else{
        if(rules[cmd.id].indexOf(group) !== -1){
            rules[cmd.id].splice(rules[cmd.id].indexOf(group), 1);
        }
    }
    return this;
};

/**
 * add an allow rule
 * @param cmd     the trigger/command (whatever with an id prop) that is being accessed
 * @param channel the channel (object) this is anticipated to happen on
 * @param group   @ for ops, + for voice, ugroup/user or argument for Bot.group
 */
NodeBot.prototype.addAllowRule = function addAllowRule(cmd, channel, group){
    if(group !== "@" && group !== "+"){
        group = this.group(group);
    }
    !channel.name || (channel = channel.name);

    var rules = this._allowRules[channel];
    if(!rules) rules = this._allowRules[channel] = {};
    if(!rules[cmd.id]){
        rules[cmd.id] = [group];
    }else{
        rules[cmd.id].push(group); 
    }
    return this;
};

/**
 * remove an allow rule
 * @param cmd     the trigger/command (whatever with an id prop) that is being accessed
 * @param channel the channel (object) this is anticipated to happen on
 * @param group   @ for ops, + for voice, ugroup/user or argument for Bot.group
 */
NodeBot.prototype.remAllowRule = function remAllowRule(cmd, channel, group){
    if(group !== "@" && group !== "+"){
        group = this.group(group);
    }
    !channel.name || (channel = channel.name);

    var rules = this._allowRules[channel];
    if(!rules) return this;
    if(!rules[cmd.id]){
        return this;
    }else{
        if(rules[cmd.id].indexOf(group) !== -1){
            rules[cmd.id].splice(rules[cmd.id].indexOf(group), 1);
        }
    }
    return this;
};

//
// module property handling
//
/**
 * register a handler for module object properties
 * the handler will be called when modules return objects with properties of the specified name
 * @param prop the name of the property
 * @param func the handler function that will be called with the value of the property
 */
NodeBot.prototype.registerModPropHandler = function registerModPropHandler(prop, func){
    if(!this._mpHandlers[prop]){
        this._mpHandlers[prop] = [func];
    }else{
        this._mpHandlers[prop].push(func);
    }
};

/**
 * handle a module property p in group <module>.<name>
 */
NodeBot.prototype._handleModProp = function _handleModProp(p, module, name, obj){
    if(!this._mpHandlers[p]) return;
    for(var i=0, l=this._mpHandlers[p], f; f=this._mpHandlers[p][i]; i++){
        f(module, name, obj);
    }
};


NodeBot.prototype._triggerHandler = function _triggerHandler(module, name, triggers){
    for(var i=0, t, l=triggers.length; t=triggers[i], i<l; i++){
        if(!this._config.modules[module]) return;
        this.addTrigger(t, this._config.modules[module].channels);
        this.actionGroup(module+'.'+name).push(t);
    }
};
