'use strict';
// Config file loader
var fs   = require('fs');
var path = require('path');
var logger;

// for "ini" type files
var regex = exports.regex = {
    section:        /^\s*\[\s*([^\]]*?)\s*\]\s*$/,
    param:          /^\s*([\w@\._\-\/]+)\s*=\s*(.*?)\s*$/,
    comment:        /^\s*[;#].*$/,
    line:           /^\s*(.*?)\s*$/,
    blank:          /^\s*$/,
    continuation:   /\\[ \t]*$/,
    is_integer:     /^-?\d+$/,
    is_float:       /^-?\d+\.\d+$/,
    is_truth:       /^(?:true|yes|ok|enabled|on|1)$/i,
};

var cfreader = exports;

cfreader.config_path = process.env.HARAKA ?
                       path.join(process.env.HARAKA, 'config')
                     : path.join(__dirname, './config');

cfreader.watch_files = true;
cfreader._config_cache = {};
cfreader._read_args = {};
cfreader._watchers = {};
cfreader._enoent_timer = false;
cfreader._enoent_files = {};
cfreader._sedation_timers = {};

cfreader.on_watch_event = function (name, type, options, cb) {
    return function (fse, filename) {
        if (cfreader._sedation_timers[name]) {
            clearTimeout(cfreader._sedation_timers[name]);
        }
        cfreader._sedation_timers[name] = setTimeout(function () {
            logger.loginfo('Reloading file: ' + name);
            cfreader.load_config(name, type, options);
            delete cfreader._sedation_timers[name];
            if (typeof cb === 'function') cb(); 
        }, 5 * 1000);
        logger.logdebug('Detected ' + fse + ' on ' + name);
        if (fse !== 'rename') return;
        // https://github.com/joyent/node/issues/2062
        // After a rename event, re-watch the file
        cfreader._watchers[name].close();
        try {
            cfreader._watchers[name] = fs.watch(
                name,
                { persistent: false },
                cfreader.on_watch_event(name, type, options, cb));
        }
        catch (e) {
            if (e.code === 'ENOENT') {
                cfreader._enoent_files[name] = true;
                cfreader.ensure_enoent_timer();
            }
            else {
                logger.logerror('Error watching file: ' + name + ' : ' + e);
            }
        }
    };
};

cfreader.watch_dir = function () {
    // NOTE: This only works on Linux and Windows
    var cp = cfreader.config_path;
    if (cfreader._watchers[cp]) return;
    var watcher = function (fse, filename) {
        if (!filename) return;
        var full_path = path.join(cp, filename);
        if (!cfreader._read_args[full_path]) return;
        var args = cfreader._read_args[full_path];
        if (args.options && args.options.no_watch) return;
        if (cfreader._sedation_timers[filename]) {
            clearTimeout(cfreader._sedation_timers[filename]);
        }
        cfreader._sedation_timers[filename] = setTimeout(function () {
            logger.loginfo('Reloading file: ' + full_path);
            cfreader.load_config(full_path, args.type, args.options);
            delete cfreader._sedation_timers[filename];
            if (typeof args.cb === 'function') args.cb();
        }, 5 * 1000);
        logger.logdebug('Detected ' + fse + ' on ' + filename);
    };
    try {
        cfreader._watchers[cp] = fs.watch(cp, { persistent: false }, watcher);
    }
    catch (e) {
        logger.logerror('Error watching directory ' + cp + '(' + e + ')');
    }
    return;
};

cfreader.watch_file = function (name, type, cb, options) {
    // This works on all OS's, but watch_dir() above is preferred for Linux and
    // Windows as it is far more efficient.
    // NOTE: we need a fs.watch per file. It's impossible to watch non-existent
    // files. Instead, note which files we attempted
    // to watch that returned ENOENT and fs.stat each periodically
    if (cfreader._watchers[name] || (options && options.no_watch)) return;
    try {
        cfreader._watchers[name] = fs.watch(
            name, {persistent: false},
            cfreader.on_watch_event(name, type, options, cb));
    }
    catch (e) {
        if (e.code !== 'ENOENT') { // ignore error when ENOENT
            logger.logerror('Error watching config file: ' + name + ' : ' + e);
        }
        else {
            cfreader._enoent_files[name] = true;
            cfreader.ensure_enoent_timer();
        }
    }
    return;
};

cfreader.get_cache_key = function (name, options) {
    // this ordering of objects isn't guaranteed to be consistent, but I've
    // heard that it typically is.
    if (options) return name + JSON.stringify(options);

    if (cfreader._read_args[name] && cfreader._read_args[name].options) {
        return name + JSON.stringify(cfreader._read_args[name].options);
    }

    return name;
};

cfreader.read_config = function(name, type, cb, options) {
    // Store arguments used so we can re-use them by filename later
    // and so we know which files we've attempted to read so that
    // we can ignore any other files written to the same directory.

    cfreader._read_args[name] = {
        type: type,
        cb: cb,
        options: options
    };

    // Check cache first
    if (!process.env.WITHOUT_CONFIG_CACHE) {
        var cache_key = cfreader.get_cache_key(name, options);
        if (cache_key in cfreader._config_cache) {
            //logger.logdebug('Returning cached file: ' + name);
            return cfreader._config_cache[cache_key];
        }
    }

    // load config file
    var result = cfreader.load_config(name, type, options);
    if (!cfreader.watch_files) return result;

    // We can watch the directory on these platforms which
    // allows us to notice when files are newly created.
    var os = process.platform;
    if (os === 'linux' || os === 'win32') {
        cfreader.watch_dir();
        return result;
    }

    // All other operating systems
    cfreader.watch_file(name, type, cb, options);
    return result;
};

cfreader.ensure_enoent_timer = function () {
    if (cfreader._enoent_timer) return;
    // Create timer
    cfreader._enoent_timer = setInterval(function () {
        var files = Object.keys(cfreader._enoent_files);
        for (var i=0; i<files.length; i++) {
            var file = files[i];
            /* BLOCK SCOPE */
            (function (file) {
                fs.stat(file, function (err) {
                    if (err) return;
                    // File now exists
                    delete(cfreader._enoent_files[file]);
                    var args = cfreader._read_args[file];
                    cfreader.load_config(
                        file, args.type, args.options, args.cb);
                    cfreader._watchers[file] = fs.watch(
                        file, {persistent: false},
                        cfreader.on_watch_event(
                            file, args.type, args.options, args.cb));
                });
            })(file); // END BLOCK SCOPE
        }
    }, 60 * 1000);
};

cfreader.get_filetype_reader = function (type) {
    if (/^(list|value|data)$/.test(type)) {
        return require('./cfreader/flat');
    }
    return require('./cfreader/' + type);
};

cfreader.load_config = function(name, type, options) {
    var result;

    var cfrType = cfreader.get_filetype_reader(type);

    if (!utils.existsSync(name)) {
        
        if (!/\.json$/.test(name)) {
            return cfrType.empty(options, type);
        }

        var yaml_name = name.replace(/\.json$/, '.yaml');
        if (!utils.existsSync(yaml_name)) {
            return cfrType.empty(options, type);
        }

        name = yaml_name;
        type = 'yaml';
        cfrType = cfreader.get_filetype_reader(type);
    }

    try {
        switch (type) {
            case 'ini':
                result = cfrType.load(name, options, regex);
                break;
            case 'json':
            case 'yaml':
                result = cfrType.load(name);
                cfreader.process_file_overrides(name, result);
                break;
            case 'binary':
            default:
                result = cfrType.load(name, type, options, regex);
        }
    }
    catch (err) {
        if (err.code !== 'EBADF') throw err;
        if (cfreader._config_cache[name]) {
            result = cfreader._config_cache[name];
        }
    }

    if (!options || !options.no_cache) {
        var cache_key = cfreader.get_cache_key(name, options);
        cfreader._config_cache[cache_key] = result;
    }

    return result;
};

cfreader.process_file_overrides = function (name, result) {
    // We might be re-loading this file:
    //     * build a list of cached overrides
    //     * remove them and add them back
    var cp = cfreader.config_path;
    if (cfreader._config_cache[name]) {
        var ck_keys = Object.keys(cfreader._config_cache[name]);
        for (var i=0; i<ck_keys.length; i++) {
            if (ck_keys[i].substr(0,1) !== '!') continue;
            delete cfreader._config_cache[path.join(cp, ck_keys[i].substr(1))];
        }
    }

    // Allow JSON files to create or overwrite other
    // configuration file data by prefixing the
    // outer variable name with ! e.g. !smtp.ini
    var keys = Object.keys(result);
    for (var j=0; j<keys.length; j++) {
        if (keys[j].substr(0,1) !== '!') continue;
        var fn = keys[j].substr(1);
        // Overwrite the config cache for this filename
        logger.logwarn('Overriding file ' + fn + ' with config from ' + name);
        cfreader._config_cache[path.join(cp, fn)] = result[keys[j]];
    }
};

var utils  = require('./utils');
var logger = require('./logger');
