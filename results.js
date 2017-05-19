// results.js - structured storage of plugin results

"use strict"

var util = require('util');

// see docs in docs/results.md
var append_lists = ['msg','pass','fail','skip','err'];
var overwrite_lists = ['hide','order'];
var log_opts     = ['emit','human','human_html'];
var init_opts    = ['conn','txn','plugin'];
var all_opts     = append_lists.concat(overwrite_lists, log_opts, init_opts);

function Results(connection, plugin, args) {
    if (!connection) throw "connection is required! see docs/results.md";
    this.connection = connection;
    if (!plugin) throw "plugin is required, see docs/results.md";
    this.plugin = plugin;
    this.args = args;

    var name = this.get_results_name();
    connection.logprotocol(plugin, "results.Results, name for " + plugin.name + ": " + name);

    var results = (args && args.txn) ? connection.transaction.results[name] :
                                    connection.results[name];
    if (results && results !== undefined) {
        connection.logprotocol(plugin, "results.Result, found existing results");
        return; // init once per connection
    }

    connection.logprotocol(plugin, "results.Results initializing new results");
    var new_result = {
        pass: [],
        fail: [],
        msg: [],
        err: [],
        skip: [],
        hide: (args && args.hide) ? args.hide : [],
        order: (args && args.order) ? args.order : [],

    };
    if (args && args.txn) {
        connection.transaction.results[name] = new_results;
        return;
    }
    connection.results[name] = new_results;
}

Results.prototype.save = function (obj) {
    if (!obj) throw("save argument must be an obj, see docs/results.md");
    var name = this.get_results_name();
    this.connection.logprotocol(this.plugin, "results.save, name for " + this.plugin.name + ": " + name);

    var results = this.find_results(name);
    if (!results) {
        this.connection.logprotocol(this.plugin, "results.save, didn't find results");
        return;
    }

    // these are arrays each invocation appends to
    for (var i=0; i < append_lists.length; i++) {
        var key = append_lists[i];
        if (!obj[key]) continue;
        results[key].push(obj[key]);
    }

    // these arrays are overwritten when passed
    for (var j=0; j < overwrite_lists.length; j++) {
        var key = overwrite_lists[j];
        if (!obj[key]) continue;
        results[key] = obj[key];
    }

    // TODO: counter (de|in)crementing?
    var conn = this.connection;

    // anything else is an arbitrary key/val to store
    for (var key in obj) {
        if (all_opts.indexOf(key) !== -1) continue; // weed out our keys
        conn.logprotocol(this.plugin, 'setting ' + key + ' to ' + obj[key]);
        results[key] = obj[key];            // save the rest
    }

    // collate results, log, and return
    var human_msg = obj.human;
    if (obj.human) results.human = obj.human;  // override
    if (!human_msg || human_msg === undefined) {
        human_msg = private_results_collate(results);
    }

    if ( obj.emit) conn.loginfo(this.plugin, human_msg);
    if (!obj.emit) conn.logdebug(this.plugin, human_msg);
    return human_msg;
};

Results.prototype.collate = function () {
    var name = this.get_results_name();
    var results = this.find_results(name);
    if (!results) return;
    return private_results_collate(results);
};

function private_results_collate (results) {

    var r = [];

    // anything not predefined in the results was purposeful, show it first
    Object.keys(results).forEach(function (key) {
        if (all_opts.indexOf(key) !== -1) return;
        if (results.hide && results.hide.length && results.hide.indexOf(key) !== -1) return;
        if (util.isArray(results[key]) && results[key].length === 0) return;
        r.push(key + ': ' + results[key]);
    });

    // and then supporting information
    var array = append_lists;
    if (results.order && results.order.length) { array = results.order; }
    array.forEach(function (key) {
        if (!results[key] || results[key] === undefined) return;
        if (results[key] && !results[key].length) return;
        if (results.hide && results.hide.length && results.hide.indexOf(key) !== -1) return;
        r.push( key + ':' + results[key].join(', '));
    });

    results.human = r.join(',  ');
    results.human_html = r.join(', \t'); // #10 = newline within HTML title
    return r.join(',  ');
}

Results.prototype.find_results = function (name) {
    if (!name) {
        this.connection.logerror(this.plugin, "find_results called without a name!");
        return false;
    };
    var c = this.connection;
    if (c.transaction && c.transaction.results[name] && c.transaction.results[name]) {
        return c.transaction.results[name];
    }
    if (c.results[name]) return c.results[name];
    conn.logerror(this.plugin, "find_results, initialized results for " + name + " not found!");
    return false;
};

Results.prototype.get_results_name = function () {
    // allows custom results name setting plugin.results_name in caller
    this.connection.logprotocol(this.plugin, "get_results_name being called");
    if (this.plugin.results_name !== undefined)
        return this.plugin.results_name;
    return this.plugin.name;
};

module.exports = Results;

