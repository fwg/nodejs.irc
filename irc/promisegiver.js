var Promise = process.Promise;

/**
 * PromiseGiver is an abstraction for managing promises,
 * allowing for cancelation in case of destruction.
 */
var PromiseGiver = exports.PromiseGiver = function PromiseGiver(){
    this._pendingPromises = [];
}

/**
 * create a Promise
 */
PromiseGiver.prototype.create = function create(){
    var p = new Promise();
    var pg = this;

    function cleanup(){pg.remove(p);}

    p.addCallback(cleanup).addErrback(cleanup).addCancelback(cleanup);
    this._pendingPromises.push(p);

    return p;
}

/**
 * remove a promise from pending list
 */
PromiseGiver.prototype.remove = function remove(p){
    var l = this._pendingPromises,
        i = l.indexOf(p);
    if(i >= 0){
        l.splice(i, 1);
    }
}

/**
 * cancel all promises
 */
PromiseGiver.prototype.cancel = function cancel(){
    var promises = this._pendingPromises.slice();
    for(var i=0,l=promises.length;i<l;i++){
        promises[i].cancel.apply(promises[i], arguments);
    }
}

/**
 * emit error events on all promises
 */
PromiseGiver.prototype.error = function error(){
    var promises = this._pendingPromises.slice();
    for(var i=0,l=promises.length;i<l;i++){
        promises[i].emitError.apply(promises[i], arguments);
    }
}
