var configloader = require('./configfile');
var path         = require('path');
var logger       = require('./logger');

var config = exports;

var config_path = process.env.HARAKA ? path.join(process.env.HARAKA, 'config') : path.join(__dirname, './config');

config.get = function(name, type) {
    if (type !== 'nolog') {
        if (!(name.match(/^log\./))) {
            logger.logdebug("Getting config: " + name);
        }
    }
    else {
        type = arguments[2];
    }

    type = type || 'value';
    
    var full_path = path.resolve(config_path, name);
    
    var results;
    try {
        results = configloader.read_config(full_path, type);
    }
    catch (err) {
        if (err.code === 'EBADF' || err.code === 'ENOENT') {
            // no such file or directory
            if (type != 'value' ) {
                return configloader.empty_config(type);
            }
            else {
                return null;
            }
        }
        else if (!(name.match(/^log\./))) {
            logger.logerror(err.name + ': ' + err.message);
        }
    }
    return results;
};
