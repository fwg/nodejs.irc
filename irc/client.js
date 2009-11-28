// irc client module
// 

var sys = require("sys"),
    tcp = require("tcp"),
    C = require('./channel'),
    PG = require('../util/promisegiver'),
    PR = require('../util/progress'),
    U = require('./user');

/**
 * create a client that connects to one irc server. pass arguments here or set later
 * @param host the adress to connect to defaults to 127.0.0.1
 * @param port the port defaults to 6667
 * @param nick the nick to use defaults to NodeJSIRC### where ### is a random number 0-999
 * @param user the username
 * @param realname 
 * @see Client.prototype.initialize
 */
var Client = exports.Client = function Client(host, port, nick, user, realname){
    this.initialize(host, port, nick, user, realname);
};

sys.inherits(Client, process.EventEmitter);

/**
 * initialize the object
 * @see Client
 */
Client.prototype.initialize = function initialize(host, port, nick, user, realname){
    this.host = host || "127.0.0.1";
    this.port = port || 6667;
    this.nick = nick || "NodeJSIRC"+Math.floor(Math.random()*1000);
    this.user = user || "nodejs";
    this.realname = realname || "NodeJS.IRC";

    this.connection = null;
    this.buffer = "";
    this.encoding = "utf8";
    this.timeout = 60*60*1000;

    this._channels = {};
    this._promiseGiver = new PG.PromiseGiver();

    this._users = {};

    this.debug = false;

    this.version = "NodeJS.IRC 0.1 http://github.com/fwg/nodejs.irc";
    this.quitreason = 'power drained';
}

/**
 * actually open the connection
 */
Client.prototype.connect = function connect(){
    var c = this.connection = tcp.createConnection(this.port, this.host);
    c.setEncoding(this.encoding);
    c.setTimeout(this.timeout);

    var that = this;
    function addL(ev, f){
        return c.addListener(ev, (function(){
            return function(){f.apply(that,arguments)};
        })() );
    }
    addL("connect", this.onConnect);
    addL("receive", this.onReceive);
    addL("eof", this.onEOF);
    addL("timeout", this.onTimeout);
    addL("close", this.onClose);
};

/**
 * disconnect from the server
 */
Client.prototype.disconnect = function disconnect(reason){
    this._promiseGiver.cancel();

    if(this.connection.readyState !== 'closed'){
        this.connection.close();
        sys.puts("disconnected ("+reason+")");
    }
};

//
// connection event listeners
// 
Client.prototype.onConnect = function onConnect(){
    this.raw("NICK", this.nick);
    this.raw("USER", this.user, '0', '*', ':'+this.realname);

    this.emit("connect");
};

Client.prototype.onReceive = function onReceive(chunk){
    this.buffer += chunk;

    while(this.buffer){
        var offset = this.buffer.indexOf("\r\n");
        if(offset < 0){ 
            return;
        }

        var msg = this.buffer.slice(0,offset);
        this.buffer = this.buffer.slice(offset+2);
        sys.puts("< "+msg);

        msg = this.parse(msg);
        var args = [msg.cmd, msg.prefix].concat(msg.params);

        this.onMessage.apply(this, [args].concat(args));
    }
};

Client.prototype.onMessage = function onMessage(args, cmd, from, one, two, three){
    switch(cmd){
        case 'PING':
            this.raw("PONG", one);
            break;
        case 'PRIVMSG':
            // direct message
            if(one.toLowerCase() == this.nick.toLowerCase()){
                one = from.match(/^([^!]+)!.*/)[1];
            }
            // replace channel name with ch. obj
            var c = this.channel(one);
            c.addListener('PRIVMSG', this.replyCTCP);
            args[2] = c;
            c.emit.apply(c, args); 
            break;
        case '332':
        case 'TOPIC':
            this.channel(one).topic = two;
            break;
        case '331': // RPL_NOTOPIC
            this.channel(one).topic = "";
            break;
    }
    this.emit.apply(this, args);
};

Client.prototype.onEOF = function() {
    this.disconnect('EOF');
};

Client.prototype.onTimeout = function() {
    this.disconnect('timeout');
};

Client.prototype.onClose = function() {
    this.disconnect('close');
};

//
// base functionality
//

/**
 * get the channel object of channel chan, if not present, create it
 * @param chan the channel name
 * @return the channel object
 */
Client.prototype.channel = function channel(chan){
    var c = chan.toLowerCase();
    if(!this._channels[c]){
        return this._channels[c] = new C.Channel(chan, this);
    }
    return this._channels[c];
};

/**
 * get the user object from a mask/nick
 * @param mask full mask or nickname
 * @return the user object
 */
Client.prototype.user = function user(mask){
    // already a user obj
    if(mask instanceof U.User) return mask;
    if(!(typeof mask === "string" || mask instanceof String)){
        throw new TypeError('mask should be a string');
    }

    var M = mask;
    mask = mask.toLowerCase();

    if(mask.indexOf('!')===-1){ // just a nickname
        return this._users[mask] || (this._users[mask] = new U.User(M+"!.@."));
    }
    var match = mask.match(/(.+?)!.+?\@.+?/);
    if(!match) throw new TypeError("Incomplete mask: "+M);
    match = match[1];
    var obj = this._users[match];
    // likely by message from server so update the name and mask
    if(obj){
        obj.name = M.match(/(.+?)!.+?\@.+?/)[1];
        obj.mask = M;
    }
    return obj || (this._users[match] = new U.User(M));
}

/**
 * send raw message to server
 * @param cmd the command, PRIVMSG, JOIN etc
 * @param ... all the rest arguments are joined into one message
 */
Client.prototype.raw = function raw(cmd){
    if(this.connection.readyState !== "open"){
        return this.disconnect("cannot send with readyState "+this.connection.readyState);
    }

    var msg = Array.prototype.slice.call(arguments,1).join(' ') +"\r\n";

    if(this.debug)sys.puts('>'+ cmd +' '+ msg);

    this.connection.send(cmd+ " " +msg, this.encoding);
};

/**
 * parse an incoming message
 * @param msg the message
 * @return an object with .cmd, .prefix and space-split message parameters in .params
 */
Client.prototype.parse = function parse(msg){
    var match = msg.match(/(?::(\S+) )?(\S+) (.+)/);
    var parsed = {
        prefix: match[1],
        cmd: match[2]
    };
    
    var params;

    // there may be no trailing param
    if(match[3].indexOf(':') < 0){
        params = match[3].split(' ');
    }else{
        params = match[3].match(/(.*?) ?:(.*)/);
        params = (params[1])
            ? params[1].split(' ').concat(params.slice(2,3))
            : params.slice(2,3);
    }
    parsed.params = params;

    return parsed;
};

/**
 * wait for server to send specific response
 * @param reply response command, e.g. NICK, JOIN, 352, ...
 * @param timeout when promise should be canceled. pass anything not > 0 to ignore.
 * @param ... the params of the response, e.g. #channel
 *        pass "" for any match/skip
 *        pass regexp for advanced matching
 *        pass more arguments than the reply will have and they will be passed to 
 *        success callbacks
 * @return promise that is fulfilled when the response arrives
 */
Client.prototype.whenReply = function whenReply(reply, timeout){
    var p = this._promiseGiver.create(),
        args = Array.prototype.slice.call(arguments, 2),
        client = this;

    if(+timeout > 0){
         p.timeout(+timeout);
    }

    function waiter(){
        // args must fit
        for(var i=0,l=Math.min(args.length, arguments.length);i<l;i++){
            if(args[i] && (
                (args[i] instanceof RegExp && !args[i].test(arguments[i]))
                ||
                (!(args[i] instanceof RegExp) && arguments[i] != args[i]) ))
                return;
        }

        client.removeListener(reply, waiter);

        var results = args.length > arguments.length ?
                Array.prototype.slice.call(arguments).concat(args.slice(arguments.length)) :
                arguments;
        p.emitSuccess.apply(p, results); 
    };

    this.addListener(reply, waiter);

    function cleanup(e){
        client.removeListener(reply, waiter);
    };

    p.addCancelback(cleanup);
    p.addErrback(cleanup);
    
    if(this.debug)p.debug = "reply "+reply;

    return p;
};

/**
 * until one of the given replies is received. callbacks are called with the reply as
 * first parameter and the message arguments following.
 * @param replies array of reply commands
 * @param timeout when promise should be canceled. pass anything not > 0 to ignore.
 * @return promise
 */
Client.prototype.whenOneReplyOf = function whenOneReplyOf(replies, timeout){
    var p = this._promiseGiver.create();
    var client = this;

    if(+timeout > 0){
        p.timeout(+timeout);
    }

    function Waiter(reply){
        return function waiter(){
            p.emitSuccess.apply(p, [reply].concat(arguments));
        };
    }

    var waiter = [];
    for(var i=replies.length;--i>-1;){
        waiter[i] = Waiter(replies[i]);
        this.addListener(replies[i], waiter[i]);
    }

    function cleanup(){
        for(var i=replies.length;--i>-1;){
            client.removeListener(replies[i], waiter[i]);
        }
    };

    p.addCancelback(cleanup).addErrback(cleanup).addCallback(cleanup);

    if(this.debug)p.debug = "one reply of "+replies.join(',');

    return p;
};

/**
 * quit
 */
Client.prototype.quit = function quit(reason){
    reason = reason || this.quitreason;
    this.emit("QUIT", reason);
    this.raw("QUIT", ':'+reason);
}

/**
 * reconnect
 */
Client.prototype.reconnect = function reconnect(reason){
    var client = this;
    this.connection.addListener('close',function connect(){
        client.connection.removeListener('close', connect);
        client.connect();
    });
    this.quit(reason);
};

/**
 * send a privmsg to a channel or another client
 * @param channel the channel or nick
 * @param msg the message
 */
Client.prototype.privmsg = function privmsg(channel, msg){
    this.raw("PRIVMSG", channel, ':'+msg);
};

/**
 * send a notice to a channel or another client
 * @see Client.prototype.privmsg
 */
Client.prototype.notice = function notice(channel, msg){
    this.raw('NOTICE', channel, ':'+msg);
};

/**
 * @param channels to join. array or string for just one.
 * @param [keys] for the channels. also may be just a string for one channel.
 * @return progresser that finishes when all channels were joined or not.
 *         if they could be joined, the argument is the channel object,
 *         in the error case it is an array [replycode, chan, msg]
 */
Client.prototype.join = function join(channels, keys){
    if(!(channels instanceof Array)) channels = [channels];
    if(!(keys instanceof Array)) keys = [keys];

    var pg = this._promiseGiver,
        client = this;

    function NamesReceiver(channel, namelist){
        return function addNames(pre, me, at, chan, names){
            if(chan !== channel)return;

            var n = names.split(' ');
            n.map(function(x){
                return {
                    op: (x.indexOf('@')==0),
                    voice: (x.indexOf('+')==0),
                    nick: x.replace(/\+|@/,'')
                };
            });
                    
            namelist.push.apply(namelist, n);
        };
    }

    function setupPromises(channel, key){
        var chanrx = new RegExp(channel.replace(/(\W)/, '\\$1'), 'i'),
            c = client.channel(channel),
            p = pg.create();

        var Qjoin = client.whenReply("JOIN", 0, "", chanrx).addCallback(function(){
            c.joined = true;
            c.key = key;
            p.emitSuccess(c);
            Qnotjoined.cancel();
        });

        var names = [];
        var addName = NamesReceiver(channel, names);

        // receive names
        client.addListener("353", addName);
        // end of names
        var Qnames = client.whenReply("366").addCallback(function(pre, me, chan){
            if(chan !== c.name)return;
            client.removeListener("353", addName);
        });

        // topic responses 331 and 332 are handled in onMessage

        // could not join
        var Qnotjoined = client.whenOneReplyOf([
                "471", // channel is full
                "473", // invite only
                "474", // banned
                "475"  // bad key
                ]).addCallback(function(reply, pre, me, chan, msg){
            if(c.name !== chan) return;
            if(client.debug)sys.puts("could not join channel "+chan+", reason: "+msg);

            client.removeListener("353", addName);
            Qjoin.cancel();
            Qnames.cancel();
            p.emitError.call(p, reply, chan, msg);
        });

        if(client.debug)p.debug = "join "+channel;
        
        return p;
    };
    
    var p = new PR.Progress;
    
    for(var i=0, c, l=channels.length; c=channels[i], i<l; i++){
        p.add(setupPromises(c, keys[i]));
    }
    
    this.raw("JOIN", channels.join(',')+' '+keys.join(','));

    return p;
};

/**
 * part the channel
 * @param channel
 * @return promise
 */
Client.prototype.part = function part(channel){
    var p = this._promiseGiver.create(),
        client = this;

    this.whenReply("PART", 0, "", channel).addCallback(function(){
        p.emitSuccess();
        client._channels[channel] = undefined;
    });

    this.raw("PART", channel);
    
    if(this.debug)p.debug = "part "+channel;
    
    return p;
};

/**
 * update who list of channel.
 * @param channel
 * @return promise when end of who list is received
 */
Client.prototype.who = function who(channel){
    var client = this,
        p = this._promiseGiver.create(),
        wholist = [];
    
    // listen for WHOREPLY
    function addWho(pre, me, channel, user, host, server, nick, mode, hop_real){
        hop_real = hop_real.match(/^(\d+) (.+)/);
        wholist.push({
            nick: nick,
            user: user,
            host: host,
            server: server,
            op: mode.indexOf("@")!==-1,
            voice: mode.indexOf("+")!==-1,
            away: mode.indexOf("G")!==-1,
            hops: +hop_real[1],
            realname: hop_real[2]
        });    
    };
    this.addListener("352", addWho);

    this.whenReply("315", 0, "", "", channel).addCallback(function(){
        client.removeListener("352", addWho);
        p.emitSuccess(wholist);
    });

    this.raw("WHO", channel);

    if(this.debug)p.debug = "who "+channel;

    return p;
};

/**
 * reply to a CTCP command
 */
Client.prototype.replyCTCP = function replyCTCP(from, channel, msg){
    if(!/^\01/.test(msg)) return;
    var ctcp = msg.match(/^\01([A-Z]+) ?(.+)?\01/);
    switch(ctcp[1]){
        case 'VERSION':
            channel.notice('\01VERSION '+this.version+'\01');
            break;
        case 'PING':
            channel.notice(msg);
            break;
        case 'TIME':
            channel.notice('\01TIME :'+new Date()+'\01');
            break;
        default:
            // msg is cut off so we don't flood
            channel.notice('\01ERRMSG '+msg.slice(0,-26)+' :unknown query\01');
    }
};

