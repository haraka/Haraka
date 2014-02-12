// results.js - programmatic handling of plugin results

"use strict"

var util = require('util');
var config = require('./config');

// see docs in docs/Results.md
var append_lists = ['msg','pass','fail','skip','err'];
var overwrite_lists = ['hide','order'];
var log_opts     = ['emit','human','human_html'];
var all_opts     = append_lists.concat(overwrite_lists, log_opts);

function Results(conn) {
    this.conn = conn;
    this.store = {};
}

Results.prototype.add = function (plugin, obj) {
    var name   = plugin.name;
    var config = config.get('results', 'ini');

    var result = this.store[name];
    if (!result) {
        result = {
            pass: [],
            fail: [],
            msg: [],
            err: [],
            skip: [],
            hide: [],
            order: [],
        };
        if (config[name] && config[name].hide) {
            result.hide = config[name].hide.trim().split(/[,; ]+/);
        }
        if (config[name] && config[name].order) {
            result.order = config[name].order.trim().split(/[,; ]+/);
        }
        this.store[name] = result;
    }

    // these are arrays each invocation appends to
    for (var i=0; i < append_lists.length; i++) {
        var key = append_lists[i];
        if (!obj[key]) continue;
        result[key].push(obj[key]);
    }

    // these arrays are overwritten when passed
    for (var j=0; j < overwrite_lists.length; j++) {
        var key = overwrite_lists[j];
        if (!obj[key]) continue;
        result[key] = obj[key];
    }

    // TODO: counter (de|in)crementing?

    // anything else is an arbitrary key/val to store
    for (var key in obj) {
        if (all_opts.indexOf(key) !== -1) continue; // weed out our keys
        result[key] = obj[key];            // save the rest
    }

    // collate results, log, and return
    var human_msg = obj.human;
    if (obj.human) result.human = obj.human;  // override
    if (!human_msg || human_msg === undefined) {
        human_msg = _results_collate(result);
    }

    if (obj.emit) this.conn.loginfo(plugin, human_msg);
    // TODO, make this work
//  if (config[name]['loglevel']) {
//      var loglevel = config[name]['loglevel'];
//      this.conn[loglevel](plugin, human_msg);
//  }
    return human_msg;
};

Results.prototype.collate = function (plugin) {
    var name = plugin.name;
    var result = this.store[name];
    if (!result) return;
    return _results_collate(result);
};

function _results_collate (result) {

    var r = [];

    // anything not predefined in the result was purposeful, show it first
    Object.keys(result).forEach(function (key) {
        if (all_opts.indexOf(key) !== -1) return;
        if (result.hide && result.hide.length && result.hide.indexOf(key) !== -1) return;
        if (util.isArray(result[key]) && result[key].length === 0) return;
        r.push(key + ': ' + result[key]);
    });

    // and then supporting information
    var array = append_lists;
    if (result.order && result.order.length) { array = result.order; }
    array.forEach(function (key) {
        if (!result[key] || result[key] === undefined) return;
        if (result[key] && !result[key].length) return;
        if (result.hide && result.hide.length && result.hide.indexOf(key) !== -1) return;
        r.push( key + ':' + result[key].join(', '));
    });

    result.human = r.join(',  ');
    result.human_html = r.join(', \t'); // #10 = newline within HTML title
    return r.join(',  ');
}

module.exports = Results;

