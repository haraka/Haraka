"use strict";
var configloader = require('./configfile');
var path         = require('path');
var logger       = require('./logger');

var config = exports;

var config_path = process.env.HARAKA ? path.join(process.env.HARAKA, 'config') : path.join(__dirname, './config');

config.get = function(name, type, cb) {
    if (type === 'nolog') {
        type = arguments[2]; // deprecated - TODO: remove later
    }

    type = type || 'value';
    var full_path = path.resolve(config_path, name);
    var results = configloader.read_config(full_path, type, cb); 
    
    // Pass arrays by value to prevent config being modified accidentally.
    if (Array.isArray(results)) {
        return results.slice();
    } 
    else {
        return results;
    }
};
