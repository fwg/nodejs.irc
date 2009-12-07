var C = require('../irc/client'),
    sys = require('sys');

/**
 * the bot class can be used to define a bot/service.
 * @see Bot.prototype.initialize
 * @constructor
 * @name Bot
 */
var Bot = exports.Bot = function Bot(config){
    this.initialize(config);
}; 

sys.inherits(Bot, C.Client);

/**
 * the object initialization
 * @param config configuration object with at minumum keys host, port, nick, user 
 *               and realname
 * @see Client.initialize
 */
Bot.prototype.initialize = function initialize(config){
    Bot.super_.initialize.call(this, config.host, config.port, config.nick,
                                                    config.user, config.realname);

    this._triggers = {};
    this._triggers.PRIV = [];
    this._triggers['*'] = [];
};

/**
 * findTrigger looks for a trigger to apply.
 * @param channel channel object
 * @param msg message to test
 * @return array of triggers that match
 */
Bot.prototype.findTrigger = function findTrigger(channel, msg){
    // build trigger from msg
    var triggers = [];
    // private conversation
    if(!/^[+#!&]/.test(channel.name)){
        for(var i=0, t; t = this._triggers.PRIV[i]; i++){
            if(t.trigger.test(msg)){
               triggers.push(t);
            }
        }
    }else{
        if(this._triggers[channel.name]){
          for(var i=0, ts=this._triggers[channel.name]; t = ts[i]; i++){
            if(t.trigger.test(msg)){
               triggers.push(t);
            }
          }
        }
        for(var i=0, ts=this._triggers['*']; t = ts[i]; i++){
            if(t.trigger.test(msg)){
               triggers.push(t);
            }
        }
    }
    return triggers;
};


//
// Trigger management
// 
Bot.prototype.Trigger = require('./trigger').Trigger;

/**
 * add a trigger to certain channels
 * @param channels an array of the channels (strings) that the trigger will be available in. 
 *                 the special channel "PRIV" is used for queries.
 *                 this does not collide with a potential user named PRIV. his channel
 *                 would be "priv".
 *                 the special channel '*' means any channel but private.
 */
Bot.prototype.addTrigger = function addTrigger(trigger, channels){
    var ts;
    for(var i=0, channel; channel = channels[i]; i++){
        ts = this._triggers[channel];
        if(!ts)this._triggers[channel] = [];
        if(!ts[trigger.id]){
            ts.push(trigger);
            ts[trigger.id] = true;
        }
    }
};

/**
 * remove a trigger from certain channels
 * @see Bot.prototype.addTrigger
 */
Bot.prototype.removeTrigger = function removeTrigger(trigger, channels){
    var ts;
    for(var i=0, channel; channel = channels[i]; i++){
        ts = this._triggers[channel];
        if(!ts) continue;
        if(!ts[trigger.id]) continue;
        delete ts[trigger.id];
    }
};
