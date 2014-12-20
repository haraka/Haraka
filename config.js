'use strict';

var cfreader     = require('./configfile');
var path         = require('path');
var logger       = require('./logger');

var config = exports;

config.get = function(name, type, cb, options) {
    var a = this.arrange_args([name, type, cb, options]);
    if (!a[1]) a[1] = 'value';

    var full_path = path.resolve(cfreader.config_path, a[0]);

    var results = cfreader.read_config(full_path, a[1], a[2], a[3]);

    // Pass arrays by value to prevent config being modified accidentally.
    if (Array.isArray(results)) {
        return results.slice();
    } 

    return results;
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

    for (var i=0; i < args.length; i++) {
        if (args[i] === undefined) continue;
        var what_is_it = args[i];
        switch (typeof args[i]) {   // what is it?
            case 'function':
                cb = args[i];
                break;
            case 'object':
                options = args[i];
                break;
            case 'string':
                if (/^(ini|value|list|data|json|yaml|binary)$/.test(args[i])) {
                    fs_type = args[i];
                    break;
                }
                console.log('unknown string:' + args[i]);
                break;
        }
        // console.log('unknown arg:' + args[i] + ', typeof: ' +
        //      typeof args[i]);
    }

    if (!fs_type) {
             if (/\.json$/.test(fs_name)) fs_type = 'json';
        else if (/\.yaml$/.test(fs_name)) fs_type = 'yaml';
        else if (/\.ini$/.test(fs_name))  fs_type = 'ini';
        else                              fs_type = 'value';
    }

    return [fs_name, fs_type, cb, options];
};
