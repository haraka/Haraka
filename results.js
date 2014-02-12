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
    var name = plugin.name;

    var result = this.store[name];
    if (!result) {
        result = { pass: [], fail: [], msg: [], err: [], skip: [] };
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

    // anything else is an arbitrary key/val to store
    for (var key in obj) {
        if (all_opts.indexOf(key) !== -1) continue; // weed out our keys
        result[key] = obj[key];            // save the rest
    }

    // collate results, log, and return
    result.human = obj.human;
    if (!result.human || result.human === undefined) {
        var r = this.private_collate(result, name);
        result.human = r.join(', ');
        result.human_html = r.join(', \t ');
    }

    if (obj.emit) this.conn.loginfo(plugin, result.human);
    if (obj.err)  this.conn.logerror(plugin, obj.err);

    var cfg = config.get('results.ini', 'ini');
    // TODO, make this work
//  if (cfg[name]['loglevel']) {
//      var loglevel = cfg[name]['loglevel'];
//      this.conn[loglevel](plugin, this.human);
//  }
    return this.human;
};

Results.prototype.incr = function (plugin, obj) {
    var name = plugin.name;
    var result = this.store[name];

    if (!result) {
        result = { pass: [], fail: [], msg: [], err: [], skip: [] };
    }
    for (var key in obj) {
        var val = obj[key];
        if (isNaN(val)) throw("invalid argument to incr: " + val);
        result[key] = +(result[key] + val);
    }
};

Results.prototype.collate = function (plugin) {
    var name = plugin.name;
    var result = this.store[name];
    if (!result) return;
    return this.private_collate(result, name).join(', ');
};

Results.prototype.get = function (plugin_name) {
    var result = this.store[plugin_name];
    if (!result) return;
    return result;
};

Results.prototype.private_collate = function (result, name) {

    var r = []; var order = []; var hide = ['todo','ll','range'];

    var cfg = config.get('results', 'ini');
    if (cfg[name] && cfg[name].hide) {
        hide = cfg[name].hide.trim().split(/[,; ]+/);
    }
    if (cfg[name] && cfg[name].order) {
        order = cfg[name].order.trim().split(/[,; ]+/);
    }

    // anything not predefined in the result was purposeful, show it first
    for (var key in result) {
        if (all_opts.indexOf(key) !== -1) continue;
        if (hide.length && hide.indexOf(key) !== -1) continue;
        if (util.isArray(result[key]) && result[key].length === 0) continue;
        r.push(key + ': ' + result[key]);
    };

    // and then supporting information
    var array = append_lists;
    if (result.order && result.order.length) { array = result.order; }
    for (var i=0; i < array.length; i++) {
        var key = array[i];
        if (!result[key] || result[key] === undefined) continue;
        if (result[key] && !result[key].length) continue;
        if (hide && hide.length && hide.indexOf(key) !== -1) continue;
        r.push( key + ':' + result[key].join(', '));
    };

    return r;
}

module.exports = Results;

