"use strict";
// An SMTP Transaction

var config = require('./config');
var Header = require('./mailheader').Header;
var body   = require('./mailbody');
var utils  = require('./utils');
var MessageStream = require('./messagestream');

var trans = exports;

function Transaction() {
    this.uuid = null;
    this.mail_from = null;
    this.rcpt_to = [];
    this.header_lines = [];
    this.data_lines = [];
    this.banner = null;
    this.data_bytes = 0;
    this.header_pos = 0;
    this.body = null;
    this.parse_body = false;
    this.notes = {};
    this.header = new Header();
    this.message_stream = null;
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
    // Initialize MessageStream here to pass in the UUID
    t.message_stream = new MessageStream(config.get('smtp.ini'), t.uuid, t.header.header_list);
    return t;
};

Transaction.prototype.add_data = function(line) {
    this.message_stream.add_line(line);
    if (typeof line !== 'string') {
        line = line.toString('binary');
    }
    line = line.replace(/^\./, '').replace(/\r\n$/, '\n');
    // check if this is the end of headers line  
    if (this.header_pos === 0 && line[0] === '\n') {
        this.header.parse(this.header_lines);
        this.header_pos = this.header_lines.length;
        if (this.parse_body) {
            this.body = this.body || new body.Body(this.header, {"banner": this.banner});
        }
    }
    else if (this.header_pos === 0) {
        // Build up headers
        this.header_lines.push(line);
    }
    else if (this.header_pos && this.parse_body) {
        this.body.parse_more(line);
    }
};

Transaction.prototype.end_data = function() {
    if (this.header_pos && this.parse_body) {
        var data = this.body.parse_end();
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
};

Transaction.prototype.set_banner = function (text, html) {
    throw "transaction.set_banner is currently non-functional";
    this.parse_body = true;
    if (!html) {
        html = text.replace(/\n/g, '<br/>\n');
    }
    this.banner = [text, html];
}
