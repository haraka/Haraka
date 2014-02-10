// note.js - programmatic handling of plugin notes

"use strict"

var util = require('util');

// see docs in docs/note.md
var append_lists = ['msg','pass','fail','skip','err'];
var overwrite_lists = ['hide','order'];
var log_opts     = ['emit','human','human_html'];
var init_opts    = ['conn','txn','plugin'];
var all_opts     = append_lists.concat(overwrite_lists, log_opts, init_opts);

function Note(connection, plugin, args) {
    if (!connection) throw "connection is required! see docs/note.md";
    this.connection = connection;
    if (!plugin) throw "plugin is required, see docs/note.md";
    this.plugin = plugin;
    this.args = args;

    var name = this.get_note_name();
    connection.logdebug(plugin, "note.Note, name for " + plugin.name + ": " + name);

    var note = args.txn ? connection.transaction.notes[name] : 
                          connection.notes[name];
    if (note && note !== undefined) {
        connection.logdebug(plugin, "note.Note, found existing note");
        return; // init once per connection
    }

    connection.logdebug(plugin, "note.Note initializing new note");
    var new_note = {
        pass: [],
        fail: [],
        msg: [],
        err: [],
        skip: [],
    };
    if (args.txn) {
        connection.transaction.notes[name] = new_note;
        return;
    }
    connection.notes[name] = new_note;
}

Note.prototype.save = function (obj) {
    if (!obj) throw("save argument must be an obj, see docs/note.md");
    var name = this.get_note_name();
    this.connection.logdebug(this.plugin, "note.save, name for " + this.plugin.name + ": " + name);

    var note = this.find_note(name);
    if (!note) {
        this.connection.logdebug(this.plugin, "note.save, didn't find note");
        return;
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
    var conn = this.connection;

    // anything else is an arbitrary key/val to store
    for (var key in obj) {
        if (all_opts.indexOf(key) !== -1) continue; // weed out our keys
        conn.logprotocol(this.plugin, 'setting ' + key + ' to ' + obj[key]);
        note[key] = obj[key];            // save the rest
    }

    // collate results, log, and return
    var human_msg = obj.human;
    if (obj.human) note.human = obj.human;  // override
    if (!human_msg || human_msg === undefined) {
        human_msg = private_note_collate(note);
    }

    if ( obj.emit) conn.loginfo(this.plugin, human_msg);
    if (!obj.emit) conn.logdebug(this.plugin, human_msg);
    return human_msg;
};

Note.prototype.collate = function () {
    var name = this.get_note_name();
    var note = this.find_note(name);
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
        if (!note[key] || note[key] === undefined) return; // overrode note_init
        if (note[key] && !note[key].length) return;
        if (note.hide && note.hide.length && note.hide.indexOf(key) !== -1) return;
        r.push( key + ':' + note[key].join(', '));
    });

    note.human = r.join(',  ');
    note.human_html = r.join(', \t'); // #10 = newline within HTML title
    return r.join(',  ');
}

Note.prototype.find_note = function (name) {
    if (!name) {
        this.connection.logerror(this.plugin, "find_note called without a name!");
        return false;
    };
    var c = this.connection;
    if (c.transaction && c.transaction.notes[name] && c.transaction.notes[name]) {
        return c.transaction.notes[name];
    }
    if (c.notes[name]) return c.notes[name];
    conn.logerror(this.plugin, "find_note, initialized note for " + name + " not found!");
    return false;
};

Note.prototype.get_note_name = function () {
    // allows custom note name setting plugin.note_name in caller
    this.connection.logdebug(this.plugin, "get_note_name being called");
    if (this.plugin.note_name !== undefined)
        return this.plugin.note_name;
    return this.plugin.name;
};

module.exports = Note;

