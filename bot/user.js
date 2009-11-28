var U = require('../irc/user'),
    sys = require('sys');

/** 
 * we extend User for groups, userlevels etc
 */
function User(mask){
    this.initialize(mask);
}
sys.inherits(User, U.User);

User.prototype.initialize = function inititalize(mask){
    User.super_.initialize.call(this, mask);

    this.groups = [];
    this.groups.lastChecked = 0;
}

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

/**
 * function that searches for matches in rules
 */
User.prototype.match = function match(rules){
    // now check rules for either user or one of the groups
    for(var i=0, rule; rule = rules[i]; i++){
        if(rule === this || this.groups.indexOf(rule)!==-1)
            return true;
    }
};
