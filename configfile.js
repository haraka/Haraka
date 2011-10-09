// Config file loader
// This is mostly internal. Please use config.js to get config data

// @TODO Something similar like this should become a standard library, since it's required by most apps

var fs = require('fs');

// @TODO Readability of the source code further below would be greatly improved if the () regions could be assigned name. 
// Instead they must be accessed by index.
// for "ini" type files
var regex = {
    section: /^\s*\[\s*([^\]]*)\s*\]\s*$/,
    param:   /^\s*([\w@\._]+)\s*=\s*(.*)\s*$/,
    comment: /^\s*[;#].*$/,
    line:    /^\s*(.*)\s*$/,
    blank:   /^\s*$/
};

var cfreader = exports;

// Automatically re-load config data, if the config file has been changed (default: true)
// @FIXME watch_files is only considered in load_config, but not in read_config (which is likely the main entry point) which 
//        means I either need to manually clean the cache or invoke load_config. Was that the intend?
cfreader.watch_files = true;  
cfreader._config_cache = {};

/**
 * Main entry point into the modul: Get config data from file. *.ini, *.json and flat files are supported. Config data 
 * are cached for speedy access. If not yet cached, they are read from file.
 * 
 * @param name file name. File name extension will used in addition to the 'type' parameter to determine the <code>type</code>. Not only if 'type' is empty.
 * @param type 'ini', 'json' or anything else for 'flat'
 * @return The config object with the config data read from file. Please @see cfreader.empty_config for more details on the return value.
 * 
 * @TODO make 'type' an optional parameter, since in most cases 'type' will be derived from file name
 * @TODO not sure 'type' is actually needed at all. May be an extensible mapper function would serve the rare case like "map *.myjson to 'json'" better.
 */
cfreader.read_config = function(name, type) {
	// @TODO No need to test against empty 'name'?
	
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

/**
 * Get an empty config object for the 'type' provided. It does not empty any existing config object and it does not update the cache. 
 * It merely creates a new config object.
 * 
 * @param type "ini", "json" or anything else for 'flat'
 * @return An empty list in case of 'flat'. Any emtpy object in case of 'json' and <code>{ main: {} }</code> in case of 'ini'
 * 
 * @TODO May be naming can be improved, since without reading the source code i's not clear whether it actually clears the config 
 *       or just provides an empty config.
 * @TODO I wish it were a bit more consistent. The return type not depending on the 'type'
 * @TODO Does it have to be exported? Isn't it internal only?
 */
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

/**
 * Load the config data from file and update the cache. <code>read_config</code> will invoke <code>load_config</code> in 
 * case the data are not yet cached.
 * 
 * @param name file name. File name extension will used to determine <code>type</code> if type is empty
 * @param type 'ini', 'json' or anything else for 'flat'
 * @return The config object with the config data read from file. Please see <code>empty_config</code> for more details on the return value.
 *
 * @TODO Does it have to be exported? Isn't it internal only?
 */
cfreader.load_config = function(name, type) {
	// @TODO No need to test against empty 'name'?

    if (type === 'ini' || /\.ini$/.test(name)) {
        result = cfreader.load_ini_config(name);
    }
    else if (type === 'json' || /\.json$/.test(name)) {
        result = cfreader.load_json_config(name);
    }
    else {
        result = cfreader.load_flat_config(name);
        // @??? Why is 'list' useful? Shouldn't load_config always return all config values from the file, instead of just the first? In case you only expect one value, the 'client' should care.
        if (result && type !== 'list') {
            result = result[0];
            if (/^\d+$/.test(result)) {
            	// @TODO parseInt is not called for 'list', which is a bit inconsistent
                result = parseInt(result);
            }
        }
    }
    
    cfreader._config_cache[name] = result;
    
    return result;
};

/**
 * Load config data from json file
 * 
 * @param name file containing data in json format
 * @return Object with json data converted into javascript Object
 * 
 * @TODO Does it have to be exported? Isn't it internal only?
 */
cfreader.load_json_config = function(name) {
	// @TODO No need to test against empty 'name'?
    return JSON.parse(fs.readFileSync(name));
}

/**
 * Load config data from ini file
 * 
 * @param name file containing data in ini format
 * @return Object containing config data. Default section, if none provided in the ini file (.e.g. [test]) will be 'main'.
 * 
 * @TODO Does it have to be exported? Isn't it internal only?
 */
cfreader.load_ini_config = function(name) {
	// @TODO This is the only loader using empty_config. Is it missing with other loaders?
    var result       = cfreader.empty_config('ini');
    var current_sect = result.main;

	// @TODO move into something like fileutils => fileutils.forEachLine(name), function(line)) ..    
    var data = new String(fs.readFileSync(name));
    var lines = data.split(/\r\n|\r|\n/);  // @TODO wouldn't /\r+|\n+/' have the same effect plus sequence of \n \r doesn't matter any more AND really empty lines are already managed.
    var match;
    
    lines.forEach( function(line) {
        if (regex.comment.test(line)) {
            return;
        }
        else if (regex.blank.test(line)) {
            return;
        }
        else if (match = regex.param.exec(line)) {
        	// @TODO Wouldn't it be nice if match[x] had a name rather than only an index? .test(match.value) and current_sect[match.section] = ...
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

/**
 * Load config data from 'flat' file
 * 
 * @param name File name
 * @return List of all values read
 * 
 * @TODO should it be part of the external interface?
 */
cfreader.load_flat_config = function(name) {
    var result = [];
    
    // @TODO move into FileUtils for re-use. See above
    var data   = new String(fs.readFileSync(name));
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
        	// @TODO conversion to integer?
        	// @TODO silently ignore additional info on the line???
            result.push(line_data[1]);
        }
    });

    return result;
};

// @TODO I guess it is easy to implement => print_config(stdout | logger)
