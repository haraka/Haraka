"use strict";
var logger = require('./logger');
var config = require('./config');

var top_level_tlds = {};
config.get('top-level-tlds','list').forEach(function (tld) {
    top_level_tlds[tld.toLowerCase()] = 1;
});

var two_level_tlds = {};
config.get('two-level-tlds', 'list').forEach(function (tld) {
    two_level_tlds[tld.toLowerCase()] = 1;
});

var three_level_tlds = {};
config.get('three-level-tlds', 'list').forEach(function (tld) {
    three_level_tlds[tld.toLowerCase()] = 1;
});

config.get('extra-tlds', 'list').forEach(function (tld) {
    var s = tld.split(/\./);
    if (s.length === 2) {
        two_level_tlds[tld.toLowerCase()] = 1;
    } 
    else if (s.length === 3) {
        three_level_tlds[tld.toLowerCase()] = 1;
    }
});

logger.loginfo('[tlds] loaded TLD files:' +
 ' 1=' + Object.keys(top_level_tlds).length +
 ' 2=' + Object.keys(two_level_tlds).length +
 ' 3=' + Object.keys(three_level_tlds).length
);

exports.top_level_tlds = top_level_tlds;
exports.two_level_tlds = two_level_tlds;
exports.three_level_tlds = three_level_tlds;

exports.split_hostname = function(host,level) {
    if (!level || (level && !(level >= 1 && level <= 3))) {
        level = 2;
    }
    var split = host.toLowerCase().split(/\./).reverse();
    var domain = "";
    // TLD
    if (level >= 1 && split[0] && top_level_tlds[split[0]]) {
        domain = split.shift() + domain;
    }
    // 2nd TLD
    if (level >= 2 && split[0] && two_level_tlds[split[0] + '.' + domain]) {
        domain = split.shift() + '.' + domain;
    }
    // 3rd TLD
    if (level >= 3 && split[0] && three_level_tlds[split[0] + '.' + domain]) {
        domain = split.shift() + '.' + domain;
    }
    // Domain
    if (split[0]) {
        domain = split.shift() + '.' + domain;
    }
    return [split.reverse().join('.'), domain];
}

