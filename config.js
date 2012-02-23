"use strict";
var configloader = require('./configfile');
var path         = require('path');
var logger       = require('./logger');
var hostname     = require('os').hostname;

var config = exports;

var config_path = process.env.HARAKA ? path.join(process.env.HARAKA, 'config') : path.join(__dirname, './config');

config.get = function(name, type, cb) {
    if (type === 'nolog') {
        type = arguments[2]; // deprecated - TODO: remove later
    }

    type = type || 'value';
    
    var full_path = path.resolve(config_path, name);
    
    var results;
    try {
        results = configloader.read_config(full_path, type, cb);
    }
    catch (err) {
        if (err.code === 'EBADF' || err.code === 'ENOENT') {
            // no such file or directory
            if (type !== 'value' ) {
                return configloader.empty_config(type);
            }
            else {
                var match = /\.(ini|json)$/.exec(name);
                if (match) {
                    return configloader.empty_config(match[1]);
                }
                // Return os.hostname() is 'me' is empty
                if (name === 'me') {
                    return hostname();
                }
                return null;
            }
        }
        else {
            // Broken config means the server dies. Tough luck!
            throw err;
        }
    }

    // Pass arrays by value to prevent config being modified accidentally.
    if (Array.isArray(results)) {
        return results.slice();
    } 
    else {
        return results;
    }
};
