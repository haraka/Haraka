"use strict";
// Config file loader

var fs = require('fs');
var utils = require('./utils');

// for "ini" type files
var regex = {
    section: /^\s*\[\s*([^\]]*)\s*\]\s*$/,
    param:   /^\s*([\w@\._]+)\s*=\s*(.*)\s*$/,
    comment: /^\s*[;#].*$/,
    line:    /^\s*(.*)\s*$/,
    blank:   /^\s*$/
};

var cfreader = exports;

cfreader.watch_files = true;
cfreader._config_cache = {};

cfreader.read_config = function(name, type, cb) {
    // Check cache first
    if (cfreader._config_cache[name]) {
        return cfreader._config_cache[name];
    }

    // load config file
    var result = cfreader.load_config(name, type);

    if (cfreader.watch_files) {
        fs.unwatchFile(name);
        fs.watchFile(name, function (curr, prev) {
            // file has changed, or files has been removed
            if (curr.mtime.getTime() !== prev.mtime.getTime() ||
                curr.nlink !== prev.nlink)
            {
                cfreader.load_config(name, type);
                if (typeof cb === 'function') cb();
            }
        });
    }

    return result;
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

cfreader.load_config = function(name, type) {
    var result;

    if (type === 'ini' || /\.ini$/.test(name)) {
        result = cfreader.load_ini_config(name);
    }
    else if (type === 'json' || /\.json$/.test(name)) {
        result = cfreader.load_json_config(name);
    }
    else {
        result = cfreader.load_flat_config(name, type);
        if (result && type !== 'list' && type !== 'data') {
            result = result[0];
            if (/^\d+$/.test(result)) {
                result = parseInt(result);
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
}

cfreader.load_ini_config = function(name) {
    var result       = cfreader.empty_config('ini');
    var current_sect = result.main;

    try {    
        if (utils.existsSync(name)) {
            var data = fs.readFileSync(name, "UTF-8");
            var lines = data.split(/\r\n|\r|\n/);
            var match;
    
            lines.forEach(function(line) {
                if (regex.comment.test(line)) {
                    return;
                }
                else if (regex.blank.test(line)) {
                    return;
                }
                else if (match = regex.param.exec(line)) {
                    if (/^\d+$/.test(match[2])) {
                        current_sect[match[1]] = parseInt(match[2]);
                    }
                    else {
                        current_sect[match[1]] = match[2];
                    }
                }
                else if (match = regex.section.exec(line)) {
                    current_sect = result[match[1]] = {};
                }
                else {
                    // error ?
                };
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
                    result.push(line_data[1]);
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
