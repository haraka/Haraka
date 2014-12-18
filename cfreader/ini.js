'use strict';

var fs = require('fs');
var utils = require('../utils');
var logger = fake_logger();

exports.load = function(name, options, regex) {
    var result       = { main: {} };
    var current_sect = result.main;
    var current_sect_name = 'main';
    var bool_matches = [];
    if (options && options.booleans) bool_matches = options.booleans.slice();

    // Initialize any booleans
    if (options && Array.isArray(options.booleans)) {
        // console.log(options.booleans);
        for (var i=0; i<options.booleans.length; i++) {
            var m = /^(?:([^\. ]+)\.)?(.+)/.exec(options.booleans[i]);
            if (!m) continue;

            var section = m[1] || 'main';
            var key     = m[2];

            var bool_default = section[0] === '+' ? true
                             :     key[0] === '+' ? true
                             : false;

            if (section.match(/^(\-|\+)/)) section = section.substr(1);
            if (    key.match(/^(\-|\+)/)) key     =     key.substr(1);

            // so boolean detection in the next section will match
            if (options.booleans.indexOf(section + '.' + key) === -1) {
                bool_matches.push(section + '.' + key);
            }

            if (!result[section]) result[section] = {};
            result[section][key] = bool_default;
        }
    }

    var match;
    var pre = '';
    
    fs.readFileSync(name, 'UTF-8')
      .split(/\r\n|\r|\n/)
      .forEach(function(line) {
        if (regex.comment.test(line)) { return; }
        if (regex.blank.test(line)  ) { return; }

        match = regex.section.exec(line);
        if (match) {
            if (!result[match[1]]) result[match[1]] = {};
            current_sect = result[match[1]];
            current_sect_name = match[1];
            return;
        }

        if (regex.continuation.test(line)) {
            pre += line.replace(regex.continuation, '');
            return;
        }

        line = pre + line;
        pre = '';

        match = regex.param.exec(line);
        if (!match) {
            logger.logerror('Invalid line in config file \'' + name +
                '\': ' + line);
            return;
        }

        if (options && Array.isArray(options.booleans) &&
            bool_matches.indexOf(current_sect_name + '.' + match[1]) !== -1) {
            current_sect[match[1]] = regex.is_truth.test(match[2]);
            var msg = 'Using boolean ' + current_sect[match[1]] +
                            ' for ' + current_sect_name + '.' +
                            match[1] + '=' + match[2];
            logger.logdebug(msg);
        }
        else if (regex.is_integer.test(match[2])) {
            current_sect[match[1]] = parseInt(match[2], 10);
        }
        else if (regex.is_float.test(match[2])) {
            current_sect[match[1]] = parseFloat(match[2]);
        }
        else {
            current_sect[match[1]] = match[2];
        }
    });
    
    return result;
};

function fake_logger() {
    try {
        return require('../logger');
    }
    catch (e) {
        var levels = [
            'data', 'protocol', 'debug', 'info', 'notice', 'warn',
            'error', 'crit', 'alert', 'emerg'
        ];
        var stub = function (msg) { console.log(msg); };
        for (var i=0; i < levels.length; i++) {
            logger['log' + levels[i]] = stub;
        }
        return stub;
    }
}