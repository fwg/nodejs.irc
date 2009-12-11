var sys = require('sys');

/**
 * A progress object is for situations when multiple async things will happen,
 * they may succeed or fail, and ultimately all things failed, succeeded, or were 
 * cancelled and the progress is complete.
 *
 * The progresser pipes the success, error and cancel events through, and finally 
 * emits "finish" with all the resulting arguments in the order the things were added.
 *
 * example:
 * var p1 = posix.cat(file1);
 * var p2 = posix.cat(file2);
 * var p = new Progress().add(p1).add(p2);
 * p.addCallback(function(content){
 *   puts(content); 
 * }).addFinishback(function(cfile1, cfile2){
 *   file3.write(cfile1[0] + cfile2[0]);
 * });
 *
 * the order of the stdout output is not predictable, but the finish callback can 
 * write the content in order. It gets the arguments of the "success"/"error"/"cancel"
 * events of the progressing things as arrays in order they were added.
 * If e.g. file1 was not found, it will not be printed to stdout and cfile1[0] will be 
 * the error object.
 * @name Progress
 * @constructor
 */
var Progress = exports.Progress = function Progress(){
    this.initialize();
};
sys.inherits(Progress, process.EventEmitter);

Progress.prototype.initialize = function(){
    this._actions = [];
    this._results = [];
    this._left = 0
    var _ = this;
    ["success","error","cancel"].map(function(f){
        _[f] = _.handler(f);
    });
};

Progress.prototype.handler = function(event){
    var prgrs = this;
    return function handler(){
        prgrs._left--;
        var a = prgrs._actions;
        var res = Array.prototype.slice.call(arguments);
        var i = a.indexOf(this);
        prgrs._results[i] = res;
        delete a[i];
        res.unshift(event);
        prgrs.emit.apply(prgrs, res);
        if(!a.length) prgrs.finish();
    };
};

/**
 * @param thing anything that supports at minimum addCallback. addErrback, addCancelback,
 * and cancel are optional and add functionality.
 */
Progress.prototype.add = function add(thing){
    this._actions.push(thing);
    this._left++;
    thing.addCallback(this.success);
    if("addErrback" in thing && typeof thing.addErrback === 'function') thing.addErrback(this.error);
    if("addCancelback" in thing && typeof thing.addCancelback === 'function') thing.addCancelback(this.cancel);
    return this;
};

/**
 * cancel the rest of the actions. of course only works with things that support .cancel()
 */
Progress.prototype.cancelRest = function(){
    for(var i=0, a, actions=this._actions, l=actions.length; i < l; i++){
        if((!a = actions[i]) || (!"cancel" in a) || (typeof a.cancel !== 'function')) continue;
        a.cancel.apply(a, arguments);
    }
};

/**
 * called automatically if all things either succeeded or failed. 
 * if called premature, the rest of the actions are cancelled.
 */
Progress.prototype.finish = function(){
    if(this._left) this.cancelRest();
    this.emit.apply("finish", this._results);
    this._left = 0;
};

//
// Promise-like behaviour
//

Progress.prototype.addCallback = function(f){
    this.addListener("success", f);
};
Progress.prototype.addErrback = function(f){
    this.addListener("errror", f);
};
Progress.prototype.addCancelback = function(f){
    this.addListener("cancel", f);
};
Progress.prototype.addFinishback = function(f){
    this.addListener("finish", f);
};
