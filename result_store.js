// results.js - programmatic handling of plugin results

'use strict';

var config = require('./config');

// see docs in docs/Results.md
var append_lists = ['msg','pass','fail','skip','err'];
var overwrite_lists = ['hide','order'];
var log_opts     = ['emit','human','human_html'];
var all_opts     = append_lists.concat(overwrite_lists, log_opts);
var cfg;

function ResultStore(conn) {
    this.conn = conn;
    this.store = {};
    cfg = config.get('results.ini');
}

function default_result () {
    return { pass: [], fail: [], msg: [], err: [], skip: [] };
}

ResultStore.prototype.has = function (plugin_name, list, search) {
    var result = this.store[plugin_name];
    if (!result) return false;
    if (!result[list]) return false;
    if (typeof result[list] === 'string') {
        if (typeof search === 'string' && search === result[list]) return true;
        if (typeof search === 'object' && result[list].match(search)) {
            return true;
        }
        return false;
    }
    if (Array.isArray(result[list])) {
        for (var i=0; i<result[list].length; i++) {
            var item = result[list][i];
            if (typeof search === 'string' && search === item) return true;
            if (typeof search === 'object' && item.match(search)) return true;
        }
    }
    return false;
};

ResultStore.prototype.add = function (plugin, obj) {
    var name = plugin.name;

    var result = this.store[name];
    if (!result) {
        result = default_result();
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
        key = overwrite_lists[j];
        if (!obj[key]) continue;
        result[key] = obj[key];
    }

    // anything else is an arbitrary key/val to store
    for (key in obj) {
        if (all_opts.indexOf(key) !== -1) continue; // weed out our keys
        result[key] = obj[key];            // save the rest
    }

    // collate results
    result.human = obj.human;
    if (!result.human) {
        var r = this.private_collate(result, name);
        result.human = r.join(', ');
        result.human_html = r.join(', \t ');
    }

    // logging results
    if (obj.emit) this.conn.loginfo(plugin, result.human);  // by request
    if (obj.err)  this.conn.logerror(plugin, obj.err);      // by default
    if (!obj.emit && !obj.err) {                            // by config
        var pic = cfg[name];
        if (pic && pic.debug) this.conn.logdebug(plugin, result.human);
    }
    return this.human;
};

ResultStore.prototype.incr = function (plugin, obj) {
    var result = this.store[plugin.name];
    if (!result) {
        result = default_result();
        this.store[plugin.name] = result;
    }

    for (var key in obj) {
        var val = parseFloat(obj[key]) || 0;
        if (isNaN(val)) val = 0;
        if (isNaN(result[key])) result[key] = 0;
        result[key] = parseFloat(result[key]) + parseFloat(val);
    }
};

ResultStore.prototype.push = function (plugin, obj) {
    var result = this.store[plugin.name];
    if (!result) {
        result = default_result();
        this.store[plugin.name] = result;
    }

    for (var key in obj) {
        if (!result[key]) result[key] = [];
        result[key].push( obj[key] );
    }
};

ResultStore.prototype.collate = function (plugin) {
    var name = plugin.name;
    var result = this.store[name];
    if (!result) return;
    return this.private_collate(result, name).join(', ');
};

ResultStore.prototype.get = function (plugin_name) {
    var result = this.store[plugin_name];
    if (!result) return;
    return result;
};

ResultStore.prototype.get_all = function () {
    return this.store;
};

ResultStore.prototype.private_collate = function (result, name) {

    var r = [], order = [], hide = [];

    if (cfg[name]) {
        if (cfg[name].hide)  hide  = cfg[name].hide.trim().split(/[,; ]+/);
        if (cfg[name].order) order = cfg[name].order.trim().split(/[,; ]+/);
    }

    // anything not predefined in the result was purposeful, show it first
    for (var key in result) {
        if (all_opts.indexOf(key) !== -1) continue;
        if (hide.length && hide.indexOf(key) !== -1) continue;
        if (Array.isArray(result[key]) && result[key].length === 0) continue;
        r.push(key + ': ' + result[key]);
    }

    // and then supporting information
    var array = append_lists;                   // default
    if (order && order.length) array = order;   // config file
    if (result.order && result.order.length) array = result.order; // caller

    for (var i=0; i < array.length; i++) {
        key = array[i];
        if (!result[key]) continue;
        if (!result[key].length) continue;
        if (hide && hide.length && hide.indexOf(key) !== -1) continue;
        r.push( key + ':' + result[key].join(', '));
    }

    return r;
};

module.exports = ResultStore;
