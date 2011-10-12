/**
 * @@ Standard Header @@
 */

// Get Haraka config data

var configloader = require('./configfile');
var path         = require('path');
var logger       = require('./logger');

var config = exports;

// Determine directory where all config files reside
// @TODO Isn't path.join(__dirname, 'config') more save with respect to windows?
var config_path = process.env.HARAKA ? path.join(process.env.HARAKA, 'config') : path.join(__dirname, './config');

/**
 * Get config data 
- * 
 * @param name Config file name
 * @param type 'json', 'ini', ...  (see my comment in configfile.js. I'm not sure it provides value). If 'type' === 'nolog' than nolog = true and use the next attribute as the real 'type'. May be nolog should become the optional 3rd parameter. It's a little bit strange right now.
 */
config.get = function(name, type) {
    var nolog = false;

    if (type !== 'nolog') {
        logger.logdebug("Getting config: " + name);
    }
    else {
        nolog = true;
        type = arguments[2];
    }

	// config_loader.read_config considers the 'type' and the file ('name') extension. A type of 'value' is thus only relevant for flat files, to make clear that not a list of all values should be returned, but only the first value in the file.
    type = type || 'value';
    
    var full_path = path.resolve(config_path, name);
    
    var results;
    try {
        results = configloader.read_config(full_path, type);
    }
    catch (err) {
        if (err.code === 'EBADF' || err.code === 'ENOENT') {
            // no such file or directory
            // @TODO If config were consistently an (empty) Object, the following code could go away. 
            if (type != 'value' ) {
                return configloader.empty_config(type);
            }
            else {
                var match = /\.(ini|json)$/.exec(name);
                if (match) {
                    return configloader.empty_config(matches[1]);
                }
                return null;
            }
        }
        else if (!(nolog)) {
            logger.logerror(err.name + ': ' + err.message);
        }
    }
    return results;
};
