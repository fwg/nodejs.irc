var U = require('../irc/user'),
    sys = require('sys');

/** 
 * we extend User for groups, userlevels etc
 * @name Bot.User
 * @constructor
 */
function User(mask){
    this.initialize(mask);
}
sys.inherits(User, U.User);

/**
 * init Bot.User
 * @name Bot.User.prototype.initialize
 */
User.prototype.initialize = function inititalize(mask){
    User.super_.initialize.call(this, mask);

    this.groups = [];
    this.groups.lastChecked = 0;
}

/**
 * updates the list of groups this user is in.
 * @name Bot.User.prototype.maybeUpdateGroups
 */
User.prototype.maybeUpdateGroups = function maybeUpdateGroups(groups){
    // check which groups we are in
    // if there are different groups than last time we checked
    var g = this.groups;
    if(groups.dirtyTime > g.lastChecked){
        var m = this.mask;
        g.splice(0);
        for(var i=0, group; group = groups[i]; i++){
            if(group.test(m)) g.push(group);
        }
        this.groups.lastChecked = new Date();
    }
}

// override user constructor
U.User = User;
