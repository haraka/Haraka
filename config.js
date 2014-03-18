"use strict";

var configloader = require('./configfile');
var path         = require('path');
var logger       = require('./logger');

var config = exports;

config.get = function(name, type, cb, options) {
    var args = this.arrange_args([name, type, cb, options]);
    if (!args[1]) args[1] = 'value';

    var config_path = process.env.HARAKA
                    ? path.join(process.env.HARAKA, 'config')
                    : path.join(__dirname, './config');

    var full_path = path.resolve(config_path, args[0]);

    var results = configloader.read_config(full_path, args[1], args[2], args[3]);

    // Pass arrays by value to prevent config being modified accidentally.
    if (Array.isArray(results)) {
        return results.slice();
    } 
    else {
        return results;
    }
};

/* ways get() can be called:
config.get('thing');
config.get('thing', type);
config.get('thing', cb);
config.get('thing', cb, options);
config.get('thing', options);
config.get('thing', type, cb);
config.get('thing', type, options);
config.get('thing', type, cb, options);
*/

config.arrange_args = function (args) {
    var fs_name = args.shift();
    var fs_type = null;
    var cb, options;

    for (var a=0; a < args.length; a++) {
        if (args[a] === undefined) continue;
        var what_is_it = args[a];
        if (typeof what_is_it == 'function') {
            cb = what_is_it;
            continue;
        }
        if (typeof what_is_it == 'object') {
            options = what_is_it;
            continue;
        }
        if (typeof what_is_it == 'string') {
            if (what_is_it.match(/^(ini|value|list|data|json|binary)$/)) {
                fs_type = what_is_it;
                continue;
            }
            // console.log('not recognized string:' + what_is_it);
            continue;
        }
        // console.log('unknown arg:' + what_is_it + ', typeof: ' + typeof what_is_it);
    }

    if (!fs_type && fs_name.match(/\.ini$/)) {
        fs_type = 'ini';
    }

    return [fs_name, fs_type, cb, options];
};
