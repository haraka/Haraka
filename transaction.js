"use strict";
// An SMTP Transaction

var config = require('./config');
var Header = require('./mailheader').Header;
var body   = require('./mailbody');
var utils  = require('./utils');
var MessageStream = require('./messagestream');

var trans = exports;

var MAX_HEADER_LINES = config.get('max_header_lines') || 1000;

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
    this.discard_data = false;
    this.resetting = false;
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
    if (typeof line === 'string') { // This shouldn't ever really happen...
        line = new Buffer(line);
    }
    // check if this is the end of headers line  
    if (this.header_pos === 0 && (line[0] === 0x0A || (line[0] === 0x0D && line[1] === 0x0A)) ) {
        this.header.parse(this.header_lines);
        this.header_pos = this.header_lines.length;
        if (this.parse_body) {
            this.body = this.body || new body.Body(this.header, {"banner": this.banner});
        }
    }
    else if (this.header_pos === 0) {
        // Build up headers
        if (this.header_lines.length < MAX_HEADER_LINES) {
            if (line[0] === 0x2E) line = line.slice(1); // Strip leading "."
            this.header_lines.push(line.toString('binary').replace(/\r\n$/, '\n'));
        }
    }
    else if (this.header_pos && this.parse_body) {
        if (line[0] === 0x2E) line = line.slice(1); // Strip leading "."
        var new_line = this.body.parse_more(line.toString('binary').replace(/\r\n$/, '\n'));
        
        if (!new_line.length) {
            return; // buffering for banners
        }

        new_line = new_line.replace(/^\./gm, '..').replace(/\r?\n/gm, '\r\n');
        line = new Buffer(new_line);
    }

    if (!this.discard_data) this.message_stream.add_line(line);
};

Transaction.prototype.end_data = function(cb) {
    if (this.header_lines.length && this.header.header_list.length === 0) {
        // Headers not parsed yet - must be a busted email
        // Strategy: Find first blank line, parse up to that as headers. Rest as body.
        var header_pos = 0;
        for (var i = 0; i < this.header_lines.length; i++) {
            header_pos = i;
            if (/^\s*$/.test(this.header_lines[i])) {
                this.header_lines[i] = '\n';
                break;
            }
        }
        var body_lines = this.header_lines.splice(header_pos + 1);
        this.header_lines = this.header_lines.splice(0, header_pos);
        this.header.parse(this.header_lines);
        this.header_pos = header_pos;
        if (this.parse_body) {
            this.body = this.body || new body.Body(this.header, {"banner": this.banner});
            for (var i = 0; i < body_lines.length; i++) {
                this.body.parse_more(body_lines[i]);
            }
        }
    }
    if (this.header_pos && this.parse_body) {
        var data = this.body.parse_end();
        if (data.length) {
            data = data.replace(/^\./gm, '..').replace(/\r?\n/gm, '\r\n');
            var line = new Buffer(data);

            if (!this.discard_data) this.message_stream.add_line(line);
        }
    }

    this.message_stream.add_line_end(cb);
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
    // throw "transaction.set_banner is currently non-functional";
    this.parse_body = true;
    if (!html) {
        html = text.replace(/\n/g, '<br/>\n');
    }
    this.banner = [text, html];
}
