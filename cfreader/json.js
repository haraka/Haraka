'use strict';

var fs   = require('fs');
var utils = require('../utils');

exports.load = function(name, cached) {
    var result = {};

    if (!utils.existsSync(name)) {
        // File doesn't exist. If name ends in .json, try .yaml
        if (!/\.json$/.test(name)) { return result; }

        var yaml_name = name.replace(/\.json$/, '.yaml');
        if (!utils.existsSync(yaml_name)) { return result; }

        // We have to read_config() here, so the file is watched
        // result = require('../yaml').load(yaml_name, cached);
        result = require('../cfreader.js').read_config(yaml_name);

        // Replace original config cache with this result
        cached = result;
        return result;
    }

    return JSON.parse(fs.readFileSync(name));
};