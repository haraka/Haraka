"use strict";
// Config file loader

var fs = require('fs');

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

cfreader.read_config = function(name, type) {
    // Check cache first
    if (cfreader._config_cache[name]) {
        return cfreader._config_cache[name];
    }
    
    
    // load config file
    var result = cfreader.load_config(name, type);
    
    if (cfreader.watch_files) {
        fs.unwatchFile(name);
        fs.watchFile(name, function (curr, prev) {
            // file has changed
            if (curr.mtime.getTime() !== prev.mtime.getTime()) {
                cfreader.load_config(name, type);
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
    return JSON.parse(fs.readFileSync(name));
}

cfreader.load_ini_config = function(name) {
    var result       = cfreader.empty_config('ini');
    var current_sect = result.main;
    
    var data = fs.readFileSync(name, "UTF-8");
    var lines = data.split(/\r\n|\r|\n/);
    var match;
    
    lines.forEach( function(line) {
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
    
    return result;
};

cfreader.load_flat_config = function(name, type) {
    var result = [];
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

    return result;
};
