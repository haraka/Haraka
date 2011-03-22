// An SMTP Transaction

var config = require('./config');
var logger = require('./logger');

var trans = exports;

function Transaction() {
    this.mail_from = null;
    this.rcpt_to = [];
    this.data_lines = [];
    this.data_bytes = 0;
    this.header_pos = 0;
    this.notes = {};
}

exports.Transaction = Transaction;

exports.createTransaction = function() {
    var t = new Transaction();
    return t;
};

Transaction.prototype.mail_from = function() {
    if (arguments.length) {
        this.mail_from = arguments[0];
    }
    return this.mail_from;
};

Transaction.prototype.add_data = function(line) {
    this.data_bytes += line.length;
    // check if this is the end of headers line (note the regexp isn't as strong 
    // as it should be - it accepts whitespace in a blank line - we've found this
    // to be a good heuristic rule though).
    if (this.header_pos === 0 && line.match(/^\s*$/)) {
        this.header_pos = this.data_lines.length;
    }
    this.data_lines.push(line);
};

Transaction.prototype.add_header = function(key, value) {
    var header_lines = this.data_lines.splice(0, this.header_pos);
    header_lines.push(key + ': ' + value + "\r\n");
    this.data_lines = header_lines.concat(this.data_lines);
};
