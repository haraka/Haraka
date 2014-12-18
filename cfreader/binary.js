'use strict';

var fs = require('fs');

exports.load = function(name) {
    return fs.readFileSync(name);
};