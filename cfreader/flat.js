'use strict';

var fs = require('fs');

exports.load = function(name, type, options, regex) {
    var result = [];

    var data = fs.readFileSync(name, "UTF-8");
    if (type === 'data') {
        while (data.length > 0) {
            var match = data.match(/^([^\n]*)\n?/);
            result.push(match[1]);
            data = data.slice(match[0].length);
        }
        return result;
    }

    data.split(/\r\n|\r|\n/).forEach( function(line) {
        var line_data;
        if (regex.comment.test(line)) { return; }
        if (regex.blank.test(line))   { return; }

        line_data = regex.line.exec(line);
        if (!line_data) { return; }

        result.push(line_data[1].trim());
    });

    if (result && type !== 'list' && type !== 'data') {
        result = result[0];
        if (options && 
            require('../utils').in_array(result, options.booleans)) {
            result = regex.is_truth.test(result);
        }
        else if (regex.is_integer.test(result)) {
            result = parseInt(result, 10);
        }
        else if (regex.is_float.test(result)) {
            result = parseFloat(result);
        }
    }

    // Return hostname for 'me' if no result
    if (/\/me$/.test(name) && !(result && result.length)) {
        return [ require('os').hostname() ];
    }

    // For value types with no result
    if (!(type && (type === 'list' || type === 'data'))) {
        if (!(result && result.length)) {
            return null;
        }
    }

    return result;
};

exports.empty = function (options, type) {
    if (type) {
        if (type === 'flat') return null;
        if (type === 'value') return null;
    }
    return [];
};
