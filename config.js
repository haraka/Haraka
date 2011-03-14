var configloader = require('./configfile');
var path         = require('path');
var logger       = require('./logger');

var config = exports;

var config_path = process.env.HARAKA ? path.join(process.env.HARAKA, 'config') : './config';

config.get = function(name, type) {
    if (type !== 'nolog') {
        logger.loginfo("Getting config: " + name);
    }
    else {
        type = arguments[2];
    }
    
    var full_path = path.resolve(config_path, name);
    
    var results;
    try {
        results = configloader.read_config(full_path, type);
    }
    catch (err) {
        if (err.code === 'EBADF') {
            // do nothing
            if (type === 'ini') {
                return configloader.empty_config(type);
            }
            else {
                return null;
            }
        }
        else {
            logger.logerror(err.name + ': ' + err.message);
        }
    }
    return results;
};
