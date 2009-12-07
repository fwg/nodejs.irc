// irc channel 

var sys = require('sys');

/**
 * represents a channel. can be used to send messages, see who is in the channel and so on.
 * @constructor
 * @name Channel
 */
var Channel = exports.Channel = function Channel(name, client){
  	this.name = name;
  	this._client = client;
	this.wholist = [];
    this.joined = false;
    this.topic = "";
};

sys.inherits(Channel, process.EventEmitter);

//
// automagic
//
/**
 * parts
 */
Channel.prototype.onPart = function(user){
    this.wholist.splice(this.wholist.indexOf(user), 1);
    this.wholist[user.nick] = undefined;
    user.channels.splice(user.channels.indexOf(this.name), 1):
}

/**
 * join, change the user's channel list
 */
Channel.prototype.onJoin = function(user){
    if(this.wholist.indexOf(user)<0){
        this.wholist.push(user);
        this.wholist[user.nick] = {op: false, voice: false};
    }
    if(!user.channels.indexOf(this.name)){ 
        user.channels.push(this.name);     
    }
}

/**
 * leave the  channel
 */
Channel.prototype.part = function part(){
	  this._client.part(this.name).addCallback(function(){
        this.emit("PART");
    });
};

/**
 * send a message to the channel
 * @param text the message
 */
Channel.prototype.msg = function msg(text){
	this._client.privmsg(this.name, text);
};

/**
 * send a notice to the channel
 * @param text
 */
Channel.prototype.notice = function notice(text){
    this._client.notice(this.name, text);
};

/**
 * /who channel
 * @return  promise when list is updated, success callbacks will be called
 *          with list as first parameter
 */
Channel.prototype.who = function who(){
    var channel = this;
    return this._client.who(this.name).addCallback(function(list){
        // here no simple chan.list = list because we want code that holds
        // a reference to the list work with the updated one as well
        channel.wholist.splice(0);
        for(var p in channel.wholist){
            if(!channel.wholist.hasOwnProperty(p)) continue;
            channel.wholist[p] = undefined;
        }
        list.forEach(function(x){
            channel.wholist.push(x.user);
            channel.wholist[x.user.nick] = x.mode;
        });
    });
};

/**
 * await message from mask/nick
 * @param mask mask/nick or regexp 
 *        examples: "frodo", "frodo*!*@*", /^frodo\!us\@dom\.tld$/
 * @return promise
 */
Channel.prototype.whenMessageFrom = function whenMessageFrom(mask){
    var p = process.Promise(),
        channel = this;

    if(!(mask instanceof RegExp)){
        if(mask.indexOf('!')===-1){
            mask = new RegExp("^"+mask+"\!.+?\@.+$");
        }else{
            mask = new RegExp("^"+
                mask.replace(/(\.|\@|\!)/g,'\\$1')
                    .replace(/\*/g, '.*?')
                +"$"
            );
        }
    }

    function waiter(from, channel, msg){
        if(mask.test(from)){
            p.emitSuccess(msg);
        }
    };
    this.addListener("PRIVMSG", waiter); 

    function cleanup(){
        channel.removeListener("PRIVMSG", waiter);
    }
    
    p.addErrback(cleanup);
    p.addCancelback(cleanup);
    
    return p;
};

