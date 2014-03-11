"use strict";
var configloader = require('./configfile');
var path         = require('path');
var logger       = require('./logger');

var config = exports;

var config_path = process.env.HARAKA ? path.join(process.env.HARAKA, 'config') : path.join(__dirname, './config');

/* Ways this can be called:
config.get('thing');
config.get('thing', type);
config.get('thing', cb);
config.get('thing', cb, options);
config.get('thing', options);
config.get('thing', type, cb);
config.get('thing', type, options);
config.get('thing', type, cb, options);
*/
config.get = function(name, type, cb, options) {
    if (typeof type == 'function') {
        options = cb;
        cb = type;
        type = null;
    }
    if (typeof type == 'object') {
        options = type;
        type = null;
    }
    if (typeof cb != 'function' && typeof type != 'object') {
        options = cb;
        cb = null;
    }
    type = type || 'value';
    var full_path = path.resolve(config_path, name);
    var results = configloader.read_config(full_path, type, cb, options); 
    
    // Pass arrays by value to prevent config being modified accidentally.
    if (Array.isArray(results)) {
        return results.slice();
    } 
    else {
        return results;
    }
};
