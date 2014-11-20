'use strict';
// Config file loader

var path = require('path');
var platform = process.platform;

// for "ini" type files
var regex = {
    section:        /^\s*\[\s*([^\]]*?)\s*\]\s*$/,
    param:          /^\s*([\w@\._-]+)\s*=\s*(.*?)\s*$/,
    comment:        /^\s*[;#].*$/,
    line:           /^\s*(.*?)\s*$/,
    blank:          /^\s*$/,
    continuation:   /\\[ \t]*$/,
    is_integer:     /^-?\d+$/,
    is_float:       /^-?\d+\.\d+$/,
    is_truth:       /^(?:true|yes|ok|enabled|on|1)$/i,
};

var cfreader = exports;

cfreader.config_path = process.env.HARAKA
                     ? path.join(process.env.HARAKA, 'config')
                     : path.join(__dirname, './config');
cfreader.watch_files = true;
cfreader._config_cache = {};
cfreader._read_args = {};
cfreader._watchers = {};
cfreader._enoent_timer = false;
cfreader._enoent_files = {};

cfreader.on_watch_event = function (name, type, options, cb) {
    return function (fse, filename) {
        logger.loginfo('Detected ' + fse + ', reloading ' + name);
        cfreader.load_config(name, type, options);
        if (typeof cb === 'function') cb();
        if (fse !== 'rename') return;
        // https://github.com/joyent/node/issues/2062
        // On a rename event, we'll need to re-watch the file
        cfreader._watchers[name].close();
        try {
            cfreader._watchers[name] = fs.watch(name, 
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
    }
}

cfreader.watch_dir = function () {
    // NOTE: This only works on Linux and Windows
    if (cfreader._watchers[cfreader.config_path]) return;
    try {
        cfreader._watchers[cfreader.config_path] = fs.watch(cfreader.config_path, 
                                                            { persistent: false }, 
                                                            function (fse, filename) 
        {
            if (!filename) return;
            var full_path = path.join(cfreader.config_path, filename);
            //logger.loginfo('event=' + fse + 
            //                ' filename=' + filename + 
            //                ' in_read_args=' + ((cfreader._read_args[full_path]) ? true : false));
            if (!cfreader._read_args[full_path]) return;
            var args = cfreader._read_args[full_path];
            if (args.options && args.options.no_watch) return;
            logger.loginfo('Detected ' + fse + ', reloading ' + filename);
            cfreader.load_config(full_path, args.type, args.options);
            if (typeof args.cb === 'function') args.cb();
        });
    }
    catch (e) {
        logger.logerror('Error watching directory ' + cfreader.config_path + '(' + e + ')');
    }
    return;
}

cfreader.watch_file = function (name, type, cb, options) {
    // This works on all OS's, but watch_dir() above is preferred for Linux and 
    // Windows as it is far more efficient.
    // NOTE: we have to have an fs.watch per file and it isn't possible to watch
    // a file that doesn't exist yet, so we have to note which files we attempted
    // to watch that returned ENOENT and then fs.stat each of them periodically
    if (cfreader._watchers[name] || (options && options.no_watch)) return; 
    try {
        cfreader._watchers[name] = fs.watch(name, {persistent: false}, 
                                            cfreader.on_watch_event(name, type, options, cb));
    }
    catch (e) {
        if (e.code != 'ENOENT') { // ignore error when ENOENT
            logger.logerror('Error watching config file: ' + name + ' : ' + e);
        }
        else {
            cfreader._enoent_files[name] = true;
            cfreader.ensure_enoent_timer();
        }
    }
    return;
}

cfreader.read_config = function(name, type, cb, options) {
    // Store arguments used so we can re-use them by filename later
    // and so we know which files we've attempted to read so that
    // we can ignore any other files written to the same directory.
    cfreader._read_args[name] = {
        type: type,
        cb: cb,
        options: options
    }

    // Check cache first
    if (name in cfreader._config_cache) {
        //logger.logdebug('Returning cached file: ' + name);
        return cfreader._config_cache[name];
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
                    cfreader._watchers[file] = fs.watch(file, {persistent: false}, 
                                                        cfreader.on_watch_event(file, args.type, args.options, args.cb));
                });
            })(file); // END BLOCK SCOPE
        }
    }, 60 * 1000);
}

cfreader.empty_config = function(type) {
    if (type === 'ini') {
        return { main: {} };
    }
    else if (type === 'json') {
        return {};
    }
    else {
        return [];
    }
};

cfreader.load_config = function(name, type, options) {
    var result;

    if (type === 'ini' || /\.ini$/.test(name)) {
        result = cfreader.load_ini_config(name, options);
    }
    else if (type === 'json' || /\.json$/.test(name)) {
        result = cfreader.load_json_config(name);
    }
    else if (type === 'binary') {
        result = cfreader.load_binary_config(name, type);
    }
    else {
        result = cfreader.load_flat_config(name, type, options);
        if (result && type !== 'list' && type !== 'data') {
            result = result[0];
            if (options && Array.isArray(options.booleans) && options.booleans.indexOf(result) === -1) {
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
        cfreader._config_cache[name] = result;
    }

    return result;
};

cfreader.load_json_config = function(name) {
    var result = cfreader.empty_config('json');
    try {
        if (utils.existsSync(name)) {
            result = JSON.parse(fs.readFileSync(name));
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

    try {
        if (utils.existsSync(name)) {
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
