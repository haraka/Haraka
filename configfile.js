'use strict';
// Config file loader

var path = require('path');
var platform = process.platform;
var yaml = require('js-yaml');

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
    if (platform === 'linux' || platform === 'win32') {
        cfreader.watch_dir();
    }
    else {
        // All other operating systems
        cfreader.watch_file(name, type, cb, options);
    }

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
                    cfreader.load_config(file, args.type, args.options, args.cb);
                    cfreader._watchers[file] = fs.watch(
                        file, {persistent: false},
                        cfreader.on_watch_event(file, args.type, args.options, args.cb));
                });
            })(file); // END BLOCK SCOPE
        }
    }, 60 * 1000);
};

cfreader.empty_config = function(type) {
    if (type === 'ini') {
        return { main: {} };
    }
    else if (type === 'json' || type === 'yaml') {
        return {};
    }
    else {
        return [];
    }
};

cfreader.get_filetype_reader = function (type) {
    if (type === 'value') return require('./cfreader/flat');
    if (type === 'list' ) return require('./cfreader/flat');

    return require('./cfreader/' + type);
};

cfreader.load_config = function(name, type, options) {
    var result;

    switch (type) {
        case 'ini':
            result = cfreader.load_ini_config(name, options);
            break;
        case 'json':
            result = cfreader.load_json_config(name);
            break;
        case 'yaml':
            result = cfreader.load_yaml_config(name);
            break;
        case 'binary':
            result = cfreader.load_binary_config(name, type);
            break;
        default:
            result = cfreader.load_flat_config(name, type, options);
            if (result && type !== 'list' && type !== 'data') {
                result = result[0];
                if (options && Array.isArray(options.booleans) &&
                    options.booleans.indexOf(result) === -1) {
                    result = regex.is_truth.test(result);
                }
                else if (regex.is_integer.test(result)) {
                    result = parseInt(result, 10);
                }
                else if (regex.is_float.test(result)) {
                    result = parseFloat(result);
                }
            }
    }

    if (!options || !options.no_cache) {
        var cache_key = cfreader.get_cache_key(name, options);
        cfreader._config_cache[cache_key] = result;
    }

    return result;
};

cfreader.load_json_config = function(name) {
    var result = cfreader.empty_config('json');
    var cache_key = cfreader.get_cache_key(name);
    try {
        if (utils.existsSync(name)) {
            result = JSON.parse(fs.readFileSync(name));
        }
        else {
            // File doesn't exist
            // If filename ends in .json, try .yaml instead
            if (/\.json$/.test(name)) {
                var yaml_name = name.replace(/\.json$/, '.yaml');
                if (utils.existsSync(yaml_name)) {
                    // We have to read_config() here, so the file is watched
                    result = cfreader.read_config(yaml_name, 'yaml');
                    // Replace original config cache with this result
                    cfreader._config_cache[cache_key] = result;
                }
            }
        }
    }
    catch (err) {
        if (err.code === 'EBADF') {
            if (cfreader._config_cache[cache_key]) {
                return cfreader._config_cache[cache_key];
            }
        }
        else {
            throw err;
        }
    }

    cfreader.process_file_overrides(name, result);
    return result;
};

cfreader.process_file_overrides = function (name, result) {
    // We might be re-loading this file, so build a list
    // of currently cached overrides so we can remove
    // them before we add them in again.
    var cache_key = cfreader.get_cache_key(name);
    if (cfreader._config_cache[cache_key]) {
        var ck_keys = Object.keys(cfreader._config_cache[cache_key]);
        for (var i=0; i<ck_keys.length; i++) {
            if (ck_keys[i].substr(0,1) === '!') {
                delete cfreader._config_cache[path.join(cfreader.config_path, ck_keys[i].substr(1))];
            }
        }
    }

    // Allow JSON files to create or overwrite other
    // configuration file data using by prefixing the
    // outer variable name with ! e.g. !smtp.ini
    var keys = Object.keys(result);
    for (var i=0; i<keys.length; i++) {
        if (keys[i].substr(0,1) === '!') {
            // Overwrite the config cache for this filename
            logger.logwarn('Overriding file ' + keys[i].substr(1) + ' with configuration from ' + name);
            cfreader._config_cache[path.join(cfreader.config_path, keys[i].substr(1))] = result[keys[i]];
        }
    }
};

cfreader.load_yaml_config = function(name) {
    var result = cfreader.empty_config('yaml');
    try {
        if (utils.existsSync(name)) {
            result = yaml.safeLoad(fs.readFileSync(name, 'utf8'));
        }
    }
    catch (err) {
        if (err.code === 'EBADF') {
            var cache_key = cfreader.get_cache_key(name);
            if (cfreader._config_cache[cache_key]) {
                return cfreader._config_cache[cache_key];
            }
        }
        else {
            throw err;
        }
    }
    cfreader.process_file_overrides(name, result);
    return result;
};

cfreader.load_ini_config = function(name, options) {
    var result       = cfreader.empty_config('ini');
    var current_sect = result.main;
    var current_sect_name = 'main';
    var bool_matches = [];
    if (options && options.booleans) bool_matches = options.booleans.slice();

    // Initialize any booleans
    if (options && Array.isArray(options.booleans)) {
        for (var i=0; i<options.booleans.length; i++) {
            var m = /^(?:([^\. ]+)\.)?(.+)/.exec(options.booleans[i]);
            if (!m) continue;

            var section = m[1] || 'main';
            var key     = m[2];

            var bool_default = section[0] === '+' ? true
                                :     key[0] === '+' ? true
                                : false;

            if (section.match(/^(\-|\+)/)) section = section.substr(1);
            if (    key.match(/^(\-|\+)/)) key     =     key.substr(1);

            // so the boolean detection in the next section will match
            if (options.booleans.indexOf(section+'.'+key) === -1) {
                bool_matches.push(section+'.'+key);
            }

            if (!result[section]) result[section] = {};
            result[section][key] = bool_default;
        }
    }

    if (!utils.existsSync(name)) { return result; }

    try {
        var data = fs.readFileSync(name, 'UTF-8');
        var lines = data.split(/\r\n|\r|\n/);
        var match;
        var pre = '';

        lines.forEach(function(line) {
            if (regex.comment.test(line)) {
                return;
            }
            if (regex.blank.test(line)) {
                return;
            }
            match = regex.section.exec(line);
            if (match) {
                if (!result[match[1]]) result[match[1]] = {};
                current_sect = result[match[1]];
                current_sect_name = match[1];
                return;
            }
            else if (regex.continuation.test(line)) {
                pre += line.replace(regex.continuation, '');
                return;
            }
            line = pre + line;
            pre = '';
            match = regex.param.exec(line);
            if (match) {
                if (options && Array.isArray(options.booleans) &&
                    bool_matches.indexOf(current_sect_name + '.' + match[1]) !== -1)
                {
                    current_sect[match[1]] = regex.is_truth.test(match[2]);
                    logger.logdebug('Returning boolean ' + current_sect[match[1]] +
                                    ' for ' + current_sect_name + '.' + match[1] + '=' + match[2]);
                }
                else if (regex.is_integer.test(match[2])) {
                    current_sect[match[1]] = parseInt(match[2], 10);
                }
                else if (regex.is_float.test(match[2])) {
                    current_sect[match[1]] = parseFloat(match[2]);
                }
                else {
                    current_sect[match[1]] = match[2];
                }
                return;
            }
            logger.logerror('Invalid line in config file \'' + name + '\': ' + line);
        });
    }
    catch (err) {
        if (err.code === 'EBADF') {
            if (cfreader._config_cache[name]) {
                return cfreader._config_cache[name];
            }
        }
        else {
            throw err;
        }
    }

    return result;
};

cfreader.load_flat_config = function(name, type) {
    var result = cfreader.empty_config();

    try {
        if (utils.existsSync(name)) {
            var data   = fs.readFileSync(name, "UTF-8");
            if (type === 'data') {
                while (data.length > 0) {
                    var match = data.match(/^([^\n]*)\n?/);
                    result.push(match[1]);
                    data = data.slice(match[0].length);
                }
                return result;
            }
            var lines  = data.split(/\r\n|\r|\n/);

            lines.forEach( function(line) {
                var line_data;
                if (regex.comment.test(line)) {
                    return;
                }
                if (regex.blank.test(line)) {
                    return;
                }
                line_data = regex.line.exec(line);
                if (line_data) {
                    result.push(line_data[1].trim());
                }
            });
        }
    }
    catch (err) {
        if (err.code === 'EBADF') {
            if (cfreader._config_cache[name]) {
                return cfreader._config_cache[name];
            }
        }
        else {
            throw err;
        }
    }

    // Return hostname for 'me' if no result
    if (/\/me$/.test(name) && !(result && result.length)) {
        return [ require('os').hostname() ];
    }

    // For value types with no result
    if (!(type && (type === 'list' || type === 'data'))) {
        if (!(result && result.length)) {
            return null;
        }
    }
    return result;
};

cfreader.load_binary_config = function(name, type) {
    var result = cfreader.empty_config();

    try {
        if (utils.existsSync(name)) {
            return fs.readFileSync(name);
        }
        return null;
    }
    catch (err) {
        if (err.code === 'EBADF') {
            if (cfreader._config_cache[name]) {
                return cfreader._config_cache[name];
            }
        }
        else {
            throw err;
        }
    }
};
var fs     = require('fs');
var utils  = require('./utils');
var logger = require('./logger');
