// An SMTP Transaction

var config = require('./config');
var logger = require('./logger');

var trans = exports;

function Transaction() {
    this.mail_from = null;
    this.rcpt_to = [];
    this.data_lines = [];
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

Transaction.prototype.data_add = function(line) {
    this.data_lines.push(line);
};
