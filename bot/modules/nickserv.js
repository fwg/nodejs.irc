Bot.addListener("connect", function(){
    Bot.privmsg("NickServ", "identify "+options.nick+" "+options.pass);
});
