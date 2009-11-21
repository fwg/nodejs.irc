// irc channel 

var sys = require('sys');

var Channel = exports.Channel = function Channel(name, client){
  	this.name = name;
  	this.client = client;
	this.wholist = [];
    this.names = [];
    this.joined = false;
};

sys.inherits(Channel, process.EventEmitter);

/**
 * leave the  channel
 */
Channel.prototype.part = function part(){
	  this.client.part(this.name).addCallback(function(){
        this.emit("PART");
    });
};

/**
 * send a message to the channel
 * @param text the message
 */
Channel.prototype.msg = function msg(text){
	this.client.privmsg(this.name, text);
};

/**
 * send a notice to the chanel
 * @param text
 */
Channel.prototype.notice = function notice(text){
    this.client.notice(this.name, text);
};

/**
 * /who channel
 * @return  promise when list is updated, success callbacks will be called
 *          with list as first parameter
 */
Channel.prototype.who = function who(){
    var channel = this;
    return this.client.who(this.name).addCallback(function(list){
        // here no simple chan.list = list because we want code that holds
        // a reference to the list work with the updated one as well
        channel.wholist.splice(0);
        channel.wholist.push.apply(channel.wholist, list);
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

