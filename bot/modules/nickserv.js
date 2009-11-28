/**
 * nickserv options
 *   nick the username to identify
 *   pass the password to use
 */

Bot.addListener("001", function(){
    Bot.privmsg("NickServ", "identify "+options.nick+" "+options.pass);
});
