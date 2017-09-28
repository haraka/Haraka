'use strict';

const path         = require('path');

const cfreader     = require('./configfile');

module.exports = new Config();

function Config (root_path, no_overrides) {
    this.root_path = root_path || cfreader.config_path;
    this.module_config = function (defaults_path, overrides_path) {
        const cfg = new Config(path.join(defaults_path, 'config'), true);
        if (overrides_path) {
            cfg.overrides_path = path.join(overrides_path, 'config');
        }
        return cfg;
    };
    if (process.env.HARAKA_TEST_DIR) {
        this.root_path = path.join(process.env.HARAKA_TEST_DIR, 'config');
        return;
    }
    if (process.env.HARAKA && !no_overrides) {
        this.overrides_path = root_path || cfreader.config_path;
        this.root_path = path.join(process.env.HARAKA, 'config');
    }
}

Config.prototype.get = function (name, type, cb, options) {
    const a = this.arrange_args([name, type, cb, options]);
    if (!a[1]) a[1] = 'value';

    const full_path = path.resolve(this.root_path, a[0]);

    let results = cfreader.read_config(full_path, a[1], a[2], a[3]);

    if (this.overrides_path) {
        const overrides_path = path.resolve(this.overrides_path, a[0]);

        const overrides = cfreader.read_config(overrides_path, a[1], a[2], a[3]);

        results = merge_config(results, overrides, a[1]);
    }

    // Pass arrays by value to prevent config being modified accidentally.
    if (Array.isArray(results)) {
        return results.slice();
    }

    return results;
};

function merge_config (defaults, overrides, type) {
    if (type === 'ini' || type === 'json' || type === 'yaml') {
        return merge_struct(JSON.parse(JSON.stringify(defaults)), overrides);
    }
    else if (Array.isArray(overrides) && Array.isArray(defaults) &&
        overrides.length > 0) {
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
    for (const k in overrides) {
        if (k in defaults) {
            if (typeof overrides[k] === 'object' &&
                typeof defaults[k] === 'object') {
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
    const fs_name = args.shift();
    let fs_type = null;
    let cb;
    let options;

    for (let i=0; i < args.length; i++) {
        if (args[i] === undefined) continue;
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
