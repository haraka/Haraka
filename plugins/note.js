// note.js
var util = require('util');

// see docs in docs/plugin/note.md
var append_lists = ['msg','pass','fail','skip','err'];
var overwrite_lists = ['hide','order'];
var log_opts     = ['emit','human','human_html'];
var init_opts    = ['conn','txn','plugin'];
var all_opts     = append_lists.concat(overwrite_lists, log_opts, init_opts);

exports.note = function (obj) {
    if (!validate_obj(obj)) throw("invalid obj!");

    var conn = obj.conn;
    var pi   = obj.plugin || this;
    var name = get_note_name(pi);
    var note = find_note(conn, name);

    // these are arrays each invocation appends to
    append_lists.forEach(function(key) {
        if (!obj[key]) return;
        note[key].push(obj[key]);
    });

    // these arrays are overwritten when passed
    overwrite_lists.forEach(function(key) {
        if (!obj[key]) return;
        note[key] = obj[key];
    });

    // TODO: counter (de|in)crementing?

    // anything else is an arbitrary key/val to store
    Object.keys(obj).forEach(function (key) {
        if (all_opts.indexOf(key) !== -1) return; // weed out our keys
        conn.logprotocol(pi, 'setting ' + key + ' to ' + obj[key]);
        note[key] = obj[key];            // save the rest
    });

    // collate results, log, and return
    var human_msg = obj.human;
    if (obj.human) note.human = obj.human;  // override
    if (!human_msg || human_msg === undefined) {
        human_msg = pi.note_collate(note);
    }

    if ( obj.emit) conn.loginfo(pi, human_msg);
    if (!obj.emit) conn.logdebug(pi, human_msg);
    return human_msg;
};

exports.note_collate = function (note) {
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
    note.human_html = r.join(',  &#10;'); // #10 = newline within HTML title
    return r.join(',  ');
};

exports.note_init = function (obj) {
    if (!validate_obj(obj)) throw("invalid obj!")
    if (!obj.plugin) throw "plugin is required during init!";
    var conn = obj.conn;
    var pi   = obj.plugin || this;
    var name = get_note_name(pi);
    var note = obj.txn ? conn.transaction.notes[name] : conn.notes[name];
    if (note && note !== undefined) return; // init once per connection

    var obj = {
        txn: obj.txn,
        pass: [],
        fail: [],
        msg: [],
        err: [],
        skip: [],
        hide: (obj && obj.hide) ? obj.hide : [ ],
        order: (obj && obj.order) ? obj.order : [],
    };
    if (obj.txn) {
        conn.transaction.notes[name] = obj;
        return;
    }
    conn.notes[name] = obj;
};

function get_note_name(plugin) {
    // allows custom note name setting plugin.note_name in caller
    if (plugin.note_name !== undefined) return plugin.note_name;
    return plugin.name;
}

function find_note (conn, name) {
    if (conn.transaction &&
        conn.transaction.notes[name] &&
        conn.transaction.notes[name].txn) {
            return conn.transaction.notes[name];
    }
    if (conn.notes[name]) return conn.notes[name];
    throw "initialized note not found!";
}

function validate_obj (obj) {
    if (!obj) throw "obj required!";
    if (!obj.conn) throw "conn is required!";
    return true;
}
