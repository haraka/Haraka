'use strict';

var cfreader     = require('./configfile');
var path         = require('path');
var logger       = require('./logger');

module.exports = new Config();

function Config (path) {
    this.root_path = path || cfreader.config_path;
    this.module_config = function (defaults_path, overrides_path) {
        var path = require('path'); // This can be called somehow before "path" at file top is loaded??
        var cfg = new Config(path.join(defaults_path, 'config'));
        if (overrides_path) {
            cfg.overrides_path = path.join(overrides_path, 'config');
        }
        return cfg;
    }
}

Config.prototype.get = function(name, type, cb, options) {
    var a = this.arrange_args([name, type, cb, options]);
    if (!a[1]) a[1] = 'value';

    var full_path = path.resolve(this.root_path, a[0]);

    var results = cfreader.read_config(full_path, a[1], a[2], a[3]);

    if (this.overrides_path) {
        var overrides_path = path.resolve(this.overrides_path, a[0]);

        var overrides = cfreader.read_config(overrides_path, a[1], a[2], a[3]);

        results = merge_config(results, overrides, a[1]);
    }

    // Pass arrays by value to prevent config being modified accidentally.
    if (Array.isArray(results)) {
        return results.slice();
    }

    return results;
};

function merge_config (defaults, overrides, type) {
    if (type == 'ini' || type == 'json' || type == 'yaml') {
        return merge_struct(JSON.parse(JSON.stringify(defaults)), overrides);
    }
    else if (Array.isArray(overrides) && Array.isArray(defaults) && overrides.length > 0) {
        return overrides;
    }
    else if (overrides != null) {
        return overrides;
    }
    else {
        return defaults;
    }
}

function merge_struct (defaults, overrides) {
    for (var k in overrides) {
        if (k in defaults) {
            if (typeof overrides[k] == 'object' && typeof defaults[k] == 'object') {
                defaults[k] = merge_struct(defaults[k], overrides[k]);
            }
            else {
                defaults[k] = overrides[k];
            }
        }
        else {
            defaults[k] = overrides[k];
        }
    }
    return defaults;
}

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

Config.prototype.arrange_args = function (args) {
    var fs_name = args.shift();
    var fs_type = null;
    var cb;
    var options;

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
        if (/\.json$/.test(fs_name))      fs_type = 'json';
        else if (/\.yaml$/.test(fs_name)) fs_type = 'yaml';
        else if (/\.ini$/.test(fs_name))  fs_type = 'ini';
        else                              fs_type = 'value';
    }

    return [fs_name, fs_type, cb, options];
};

// Load smtp.json or smtp.yaml as early as possible
var cfg = module.exports.get('smtp.json');
