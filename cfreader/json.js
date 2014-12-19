'use strict';

var fs = require('fs');

exports.load = function(name) {
    return JSON.parse(fs.readFileSync(name));
};

exports.empty = function () {
    return {};
};