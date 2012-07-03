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
    this.banner = null;
    this.data_bytes = 0;
    this.header_pos = 0;
    this.parse_body = false;
    this.notes = {};
    this.header = new Header();
    this.rcpt_count = {
        accept:   0,
        tempfail: 0,
        reject:   0,
    };
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
            this.body = this.body || new body.Body(this.header, {"banner": this.banner});
        }
    }
    else if (this.header_pos && this.parse_body) {
        line = this.body.parse_more(line);
    }
    if (line.length) {
        this.data_lines.push(line);
    }
};

Transaction.prototype.end_data = function() {
    if (this.header_pos && this.parse_body) {
        var data = this.body.parse_end();
        if (data.length) {
            this.data_lines.push(data);
        }
    }
}

Transaction.prototype.add_header = function(key, value) {
    this.header.add_end(key, value);
    if (this.header_pos > 0) this.reset_headers();
};

Transaction.prototype.add_leading_header = function(key, value) {
    this.header.add(key, value);
    if (this.header_pos > 0) this.reset_headers();
};

Transaction.prototype.reset_headers = function () {
    var header_lines = this.header.lines();
    this.data_lines = header_lines.concat(this.data_lines.slice(this.header_pos));
    this.header_pos = header_lines.length;
};

Transaction.prototype.remove_header = function (key) {
    this.header.remove(key);
    if (this.header_pos > 0) this.reset_headers();
};

Transaction.prototype.attachment_hooks = function (start, data, end) {
    this.parse_body = 1;
    this.body = this.body || new body.Body(this.header, {"banner": this.banner});
    this.body.on('attachment_start', start);
    if (data)
        this.body.on('attachment_data',  data);
    if (end)
        this.body.on('attachment_end', end);
};

Transaction.prototype.set_banner = function (text, html) {
    this.parse_body = true;
    if (!html) {
        html = text.replace(/\n/g, '<br/>\n');
    }
    this.banner = [text, html];
}
