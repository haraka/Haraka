"use strict";
// Config file loader

// for "ini" type files
var regex = {
    section:        /^\s*\[\s*([^\]]*?)\s*\]\s*$/,
    param:          /^\s*([\w@\._]+)\s*=\s*(.*?)\s*$/,
    comment:        /^\s*[;#].*$/,
    line:           /^\s*(.*?)\s*$/,
    blank:          /^\s*$/,
    continuation:   /\\[ \t]*$/,
    is_integer:     /^-?\d+$/,
    is_float:       /^-?\d+\.\d+$/,
    is_truth:       /^(?:true|yes|ok|enabled|on|1)$/i,
};

var cfreader = exports;

cfreader.watch_files = true;
cfreader._config_cache = {};
cfreader._watchers = {};

cfreader.read_config = function(name, type, cb, options) {
    // Check cache first
    if (name in cfreader._config_cache) {
        // logger.logdebug("Returning cached file: " + name);
        return cfreader._config_cache[name];
    }

    // load config file
    var result = cfreader.load_config(name, type, options);

    if (cfreader.watch_files) {
        if (name in cfreader._watchers) return result;
        try {
            cfreader._watchers[name] = fs.watch(name, {persistent: false}, function (fse, filename) {
                logger.loginfo("Detected " + fse + ", reloading " + name);
                cfreader.load_config(name, type, options);
                if (typeof cb === 'function') cb();
            });
        }
        catch (e) {
            if (e.code != 'ENOENT') { // ignore error when ENOENT
                logger.logerror("Error watching config file: " + name + " : " + e);
            }
        }
    }

    return result;
};

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
            if (Array.isArray(options) && options['boolean'] === true) {
                result = is_truth.test(result);
            }
            else if (regex.is_integer.test(result)) {
                result = parseInt(result, 10);
            }
            else if (regex.is_float.test(result)) {
                result = parseFloat(result);
            }
        }
    }

    cfreader._config_cache[name] = result;

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
            var m;
            if (m = /^(?:([^\. ]+)\.)?(.+)/.exec(options.booleans[i])) {
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
    }

    try {
        if (utils.existsSync(name)) {
            var data = fs.readFileSync(name, "UTF-8");
            var lines = data.split(/\r\n|\r|\n/);
            var match;
            var pre = '';

            lines.forEach(function(line) {
                if (regex.comment.test(line)) {
                    return;
                }
                else if (regex.blank.test(line)) {
                    return;
                }
                else if (match = regex.section.exec(line)) {
                    current_sect = result[match[1]] = {};
                    current_sect_name = match[1];
                    return;
                }
                else if (regex.continuation.test(line)) {
                    pre += line.replace(regex.continuation, '');
                    return;
                }
                line = pre + line;
                pre = '';
                if (match = regex.param.exec(line)) {
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
                }
                else {
                    logger.logerror("Invalid line in config file '" + name + "': " + line);
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
                else if (regex.blank.test(line)) {
                    return;
                }
                else if (line_data = regex.line.exec(line)) {
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
        return null
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
