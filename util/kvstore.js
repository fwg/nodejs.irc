var posix = require('posix');

/**
 * simple key value store that can be saved to disk as JSON.<br>
 * this is more an interface that other stores can implement, using whatever backend.
 */
var Store = exports.Store = function Store(){
    this._store = {};
}

/**
 * get a value by key
 * @param key
 * @return value
 */
Store.prototype.get = function get(key){
    return this._store[key];
};

/**
 * store a value
 * @param key
 * @param value
 * @return the value
 */
Store.prototype.put = function(key, value){
    this._store[key] = value;
    return value;
};

/**
 * remove a key and its value
 * @param key
 * @return true if successful
 */
Store.prototype.del = function(key){
    return delete this._store[key];
};

/**
 * save the store
 * @param file filename
 * @return promise when writing is done
 */
Store.prototype.save = function save(file){
    var _store = this._store;
    var p = new process.Promise();
    posix.open(file, process.O_WRONLY | process.O_TRUNC | process.O_CREAT, 0644)
      .addCallback(function(file){
        posix.write(file, JSON.stringify(_store), 0, "utf8")
          .addCallback(function(){
            posix.close(file).addCallback(function(){p.emitSuccess()});
        }).addErrback(function(e){
            posix.close(file);
            p.emitError(e);
        });
    }).addErrback(function(e){
        p.emitError(e);
    });
    return p;
};

/** 
 * load store from json
 * @param file filename
 */
Store.prototype.load = function load(file){
    var p = new process.Promise;
    var s = this;
    posix.cat(file).addCallback(function(cont){
        try{
          s._store = JSON.parse(cont);
        }catch(e){
          p.emitError(e);
        }
        p.emitSuccess();
    }).addErrback(function(e){
        p.emitError(e);
    });
    return p;
};

