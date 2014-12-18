'use strict';

var fs   = require('fs');
var yaml = require('js-yaml');
var utils = require('../utils');

exports.load = function(name, cached) {

    if (!utils.existsSync(name)) return {};

    return yaml.safeLoad(fs.readFileSync(name, 'utf8'));
};