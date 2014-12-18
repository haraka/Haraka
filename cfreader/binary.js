'use strict';

var fs = require('fs');
var utils = require('../utils');

exports.load = function(name, cached) {
    if (!utils.existsSync(name)) return null;
    
    return fs.readFileSync(name);
};