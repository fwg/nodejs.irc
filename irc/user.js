var sys = require('sys');

/**
 * identifying a user
 * @param nick the nickname
 * @param mask a full mask
 */
var User = exports.User = function User(mask){
    this.initialize(mask);
}

User.prototype.initialize = function (mask){
    var match = mask.match(/(.+?)!(.+?)\@(.+?)/);
    this.name = match[1]; 
    this.mask = mask;
    this.nick = this.name.toLowerCase();
    this.server = "";
    this.user = match[2];
    this.host = match[3];
    this.realname = "";
    this.hops = 0;

    this.away = false;
    this.channels = [];
}
