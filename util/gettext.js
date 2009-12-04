
/**
 * a gettext objext maps strings to different translations.<br>
 * maps have the form of {"string in programme":{"de_DE":"String im Programm", ..}, ..}<br>
 * @constructor
 * @name Gettext
 * @param [obj] initial translation map
 * @param [locale] initial default locale, defaults to "en_US"
 */
var Gettext = exports.Gettext = function Gettext(obj, locale){
    this._map = obj || {};
    this._locale = locale || "en_US";
};

/**
 * add all the translations of a map to this object's map.
 * @param map
 */
Gettext.prototype.add = function add(map){
    for(var p in map){
        if(Object.prototype.hasOwnProperty.call(map, p)){
            var m = map[p];
            var o = this._map[p] || (this._map[p] = {});
            for(var locale in m){
                o[locale] = m[locale];
            }
        }
    }
};

/**
 * set or get locale to use.
 * @param [locale] e.g. de_DE or en_US
 * @return the [old] locale setting
 */
Gettext.prototype.locale = function (locale){
    var l = this._locale;
    if(locale) this._locale = locale;
    return l;
};

/**
 * get translation 
 * @param string to translate
 * @param [locale] locale to use for this lookup
 */
Gettext.prototype.gettext = function gettext(string, locale){
    locale = locale || this._locale;
    var s;
    if((s = this._map[string]) && (s = s[locale])){
            return s;
    }
    return string;
}
