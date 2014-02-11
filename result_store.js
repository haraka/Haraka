// note.js - programmatic handling of plugin notes

"use strict"

var util = require('util');
var config = require('./config');

// see docs in docs/note.md
var append_lists = ['msg','pass','fail','skip','err'];
var overwrite_lists = ['hide','order'];
var log_opts     = ['emit','human','human_html'];
var all_opts     = append_lists.concat(overwrite_lists, log_opts);

function ResultStore(conn) {
    this.conn = conn;
    this.store = {};
}

function get_note_name = function (plugin) {
    // allows custom note name setting plugin.note_name in caller
    if (plugin.note_name !== undefined)
        return plugin.note_name;
    return plugin.name;
};

ResultStore.prototype.add = function (plugin, obj) {
    var name = get_note_name(plugin);

    var config = config.get('results_store', 'ini');

    var note = this.store[name];
    if (!note) {
        note = {
            pass: [],
            fail: [],
            msg: [],
            err: [],
            skip: [],
            hide: [],
            order: [],
        };
        if (config[name] && config[name].hide) {
            note.hide = config[name].hide.trim().split(/[,; ]+/);
        }
        if (config[name] && config[name].order) {
            note.order = config[name].order.trim().split(/[,; ]+/);
        }
        this.store[name] = note;
    }

    // these are arrays each invocation appends to
    for (var i=0; i < append_lists.length; i++) {
        var key = append_lists[i];
        if (!obj[key]) continue;
        note[key].push(obj[key]);
    }

    // these arrays are overwritten when passed
    for (var j=0; j < overwrite_lists.length; j++) {
        var key = overwrite_lists[j];
        if (!obj[key]) continue;
        note[key] = obj[key];
    }

    // TODO: counter (de|in)crementing?

    // anything else is an arbitrary key/val to store
    for (var key in obj) {
        if (all_opts.indexOf(key) !== -1) continue; // weed out our keys
        note[key] = obj[key];            // save the rest
    }

    // collate results, log, and return
    var human_msg = obj.human;
    if (obj.human) note.human = obj.human;  // override
    if (!human_msg || human_msg === undefined) {
        human_msg = private_note_collate(note);
    }

    if ( obj.emit) this.conn.loginfo(plugin, human_msg);
    // if (!obj.emit) conn.logdebug(this.plugin, human_msg);
    return human_msg;
};

ResultStore.prototype.collate = function (plugin) {
    var name = get_note_name(plugin);
    var note = this.store[name];
    if (!note) return;
    return private_note_collate(note);
};

function private_note_collate (note) {

    var r = [];

    // anything not predefined in the note was purposeful, show it first
    Object.keys(note).forEach(function (key) {
        if (all_opts.indexOf(key) !== -1) return;
        if (note.hide && note.hide.length && note.hide.indexOf(key) !== -1) return;
        if (util.isArray(note[key]) && note[key].length === 0) return;
        r.push(key + ': ' + note[key]);
    });

    // and then supporting information
    var array = append_lists;
    if (note.order && note.order.length) { array = note.order; }
    array.forEach(function (key) {
        if (!note[key] || note[key] === undefined) return;
        if (note[key] && !note[key].length) return;
        if (note.hide && note.hide.length && note.hide.indexOf(key) !== -1) return;
        r.push( key + ':' + note[key].join(', '));
    });

    note.human = r.join(',  ');
    note.human_html = r.join(', \t'); // #10 = newline within HTML title
    return r.join(',  ');
}

module.exports = ResultStore;

