var sys = require('sys');

/**
 * identifying a user
 * @param nick the nickname
 * @param mask a full mask
 * @name User
 * @constructor
 */
var User = exports.User = function User(mask){
    this.initialize(mask);
}

/**
 * init with mask
 * @name User.initialize
 */
User.prototype.initialize = function (mask){
    this.updateFromMask(mask);
    this.nick = this.name.toLowerCase();
    this.server = "";
    this.realname = "";
    this.hops = 0;

    this.away = false;
    this.channels = [];
}

/**
 * update mask
 */
User.prototype.updateFromMask = function (mask){
    var match = mask.match(/([^!]+)!([^@]+)@(.+)/);
    this.mask = mask;
    this.name = match[1];
    this.user = match[2];
    this.host = match[3];
}

