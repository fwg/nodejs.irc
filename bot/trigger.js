var sys = require('sys');

// used for a unique id per trigger.
var memo = {};

/**
 * a Trigger can be used to register an action that is executed when the bot encounters a
 * specific message on a channel.
 * example:
 * var t = new bot.Trigger(/^\!sing/).addCallback(function sing(from, channel){channel.msg('lalalalala')});
 * @see Bot.addTrigger
 * @param trigger  either a string or a regex. the string may conatain the wildcards * for any
 *                 number of characters, + for one or more and ? for one character.
 *                 so "`+ * becomes /`.+? .*?/.
 * @constructor
 * @name Bot.Trigger
 */
var Trigger = exports.Trigger = function Trigger(trigger){
    var s = trigger.toString();
    if(memo[s]) return memo[s];

    if(!(trigger instanceof RegExp)){
        trigger = new RegExp(trigger.replace(/(?!\\)[^\w?*+]/g, '\\$1').replace(/\?/g,".?").replace(/(\*|\+)/g,".$1?"));
    }

    this.trigger = trigger;
    memo[s] = this;
    this.id = "trigger|"+s;
};
sys.inherits(Trigger, process.EventEmitter);

/**
 * add callback to the event that the trigger is matched.
 * @name Bot.Trigger.prototype.addCallback
 */
Trigger.prototype.addCallback = function (f){
    this.addListener("match", f);
    return this;
};

