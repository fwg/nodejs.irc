/**
 * beer options
 *   drunk: number of beers one can drink before being drunk.
 */

var sys = require('sys');

// we have translations for our output
var i18nObj = {
    'gives beer to':{de_DE:'verteilt bier an'},
    'and':{de_DE:'und'},
    'is drunk':{de_DE:'ist betrunken'},
    'nicks beer from':{de_DE:'klaut bier von'},
    'beer':{de_DE:'bier'},
    'has':{de_DE:'hat'}
};
Bot.i18n.add(i18nObj);

// shorthand for gettext
function _(s, c){
    return Bot.i18n.gettext(s, c.locale);
}

// we save our beer statistics in the bot store
var stats = Bot.store.get('beerstats');
if(!stats){
    stats = Bot.store.put('beerstats', {});
}

// we trigger on every message that starts with nick++|--
var trigger = new Bot.Trigger(/^[a-zA-Z]([a-zA-Z0-9_\-\[\]\\`^{}]+)(\+\+|\-\-)/);

var lastAction = 1;
// this func will handle the ++/--
// it gets the user object of the giving nick, the channel object, and the msg
function beer(from, channel, msg){
    var giver = from.name;
    var receivers;
    var giveortake = {};
    var last;
    // filter out beer receivers and make sure they don't get more than one
    receivers = msg.match(/[a-zA-Z]([a-zA-Z0-9_\-\[\]\\`^{}]+)(\+\+|\-\-)/g).map(function(x){
        var y = x.slice(0,-2);
        if(!giveortake[y]){
            giveortake[y] = x.slice(-2) == '--' ? -1 : 1;
            return y;
        }
    }).filter(function(x){return x;});

    // give out the beer
    receivers.forEach(function(x){
        if(!stats[x]){
            stats[x] = giveortake[x];
            stats[x].last = +new Date();
            stats[x].lastCount = giveortake[x];
        }else{
            if(last = stats[x].last){
              // if we're in the timewindow for being drunk
              if((+new Date() - last) < options.drunktime){
                if(stats[x].lastCount <= options.drunk){
                  stats[x] += giveortake[x];
                  stats[x].lastCount += giveortake[x];
                }else{
                  channel.msg(x+" "+Bot.i18n.gettext('is drunk', channel.locale));
                }
              }else{
                stats[x] += giveortake[x];
                stats[x].last = +new Date();
                stats[x].lastCount = giveortake[x];
              }
            }else{ // stats were loaded from storage
              stats[x] += giveortake[x];
              stats[x].last = +new Date();
              stats[x].lastCount = giveortake[x];
            }
        }
    });
    
    // increase the given count
    var giverg = giver + '#given';
    if(!stats[giverg]){
        stats[giverg] = 0;
    }
    stats[giverg] += receivers.length;

    // print [translated] message to the channel
    // those who receive first, then those who lose
    var given = [], stolen = [], lastg, lasts;
    for(var i=0, r; r=receivers[i]; i++){
        if(giveortake[r] < 0){
            stolen.push(r);
        }else{
            given.push(r);
        }
    }
    lastg = given.length > 1 ? given.splice(-1, 1)[0] : false;
    lasts = stolen.length > 1 ? stolen.splice(-1, 1)[0] : false;
    var msg = giver+" ";
    if(given.length){
            msg += _('gives beer to', channel)+" "+
            given.join(', ')+
            (lastg?" "+
             _('and', channel)+" "+lastg
            :"");
    }
    if(given.length && stolen.length){
        msg += " "+_('and', channel)+" ";
    }
    if(stolen.length){
        msg += _('nicks beer from', channel)+' '+
            stolen.join(', ')+
            (lasts?" "+
             _('and', channel)+" "+lasts
            :"");
    }

    channel.msg(msg);
    lastAction = +new Date();
}

// function that lists the 5 highest beer counts
var lastHSUpdate = 0;
var HS = [];
function list(from, channel, cmd){
    if(lastHSUpdate < lastAction){
        var ar = [];
        for(var p in stats){
            if(!/#given$/.test(p)){
                ar.push([p, stats[p]]);
            }
        }
        HS = ar.sort(function(x,y){
            return y[1] - x[1];
        }).slice(0,5).map(function(x){
            return x[0]+'('+x[1]+')';
        });
    }
    channel.msg(from.name+': Top5 => '+HS.join(', '));
}

function howmuch(from, channel, cmd, name){
    channel.msg(from.name+': '+name+' '+_('has', channel)+
            ' '+(stats[name] || 0)+' '+_('beer', channel));
}

// beer will be called when our trigger matches
trigger.addCallback(beer);

// we return the triggers and commands
// triggers are builtin, for commands see modules/commands.js
// the property names are used for grouping triggers/commands/...
// they can be used for specifying rules in the config file or chat messages to the bot.
return {'++':{ // group ++ encompasses:
         triggers: [trigger], // our trigger
         // and our commands 'beer' for top5 and 'beer nick' for beercount of a user
         commands: [['beer', list], ['beer +', howmuch]]
        }
       };
