"use strict";
// An SMTP Transaction

var config = require('./config');
var logger = require('./logger');
var Header = require('./mailheader').Header;
var body   = require('./mailbody');
var utils  = require('./utils');

var trans = exports;

function Transaction() {
    this.mail_from = null;
    this.rcpt_to = [];
    this.data_lines = [];
    this.data_bytes = 0;
    this.header_pos = 0;
    this.parse_body = false;
    this.notes = {};
    this.header = new Header();
}

exports.Transaction = Transaction;

exports.createTransaction = function(uuid) {
    var t = new Transaction();
    t.uuid = uuid || utils.uuid();
    return t;
};

Transaction.prototype.add_data = function(line) {
    this.data_bytes += line.length;
    // check if this is the end of headers line (note the regexp isn't as strong 
    // as it should be - it accepts whitespace in a blank line - we've found this
    // to be a good heuristic rule though).
    if (this.header_pos === 0 && line.match(/^\s*$/)) {
        this.header.parse(this.data_lines);
        this.header_pos = this.data_lines.length;
        if (this.parse_body) {
            this.body = this.body || new body.Body(this.header);
        }
    }
    else if (this.header_pos && this.parse_body) {
        this.body.parse_more(line);
    }
    this.data_lines.push(line);
};

Transaction.prototype.end_data = function() {
    if (this.header_pos && this.parse_body) {
        this.body.parse_end();
    }
}

Transaction.prototype.add_header = function(key, value) {
    this.header.add(key, value);
    this.reset_headers();
};

Transaction.prototype.reset_headers = function () {
    var header_lines = this.header.lines();
    this.data_lines = header_lines.concat(this.data_lines.slice(this.header_pos));
    this.header_pos = header_lines.length;
};

Transaction.prototype.remove_header = function (key) {
    this.header.remove(key);
    this.reset_headers();
};

Transaction.prototype.attachment_hooks = function (start, data, end) {
    this.parse_body = 1;
    this.body = this.body || new body.Body(this.header);
    this.body.on('attachment_start', start);
    if (data)
        this.body.on('attachment_data',  data);
    if (end)
        this.body.on('attachment_end', end);
};
