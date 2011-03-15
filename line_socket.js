// A subclass of Socket which reads data by line

var net  = require('net');
var util = require('util');

function Socket(options) {
    if (!(this instanceof Socket)) return new Socket(options);
    net.Socket.call(this, options);
    this.current_data = '';
    this.on('data', this.process_data);
    this.on('end', this.process_end);
}

util.inherits(Socket, net.Socket);

exports.Socket = Socket;

var line_regexp = /^([^\n]*\n)/;

Socket.prototype.process_data = function (data) {
    this.current_data += data;
    var results;
    while (results = line_regexp.exec(this.current_data)) {
        var this_line = results[1];
        this.current_data = this.current_data.slice(this_line.length);
        this.emit('line', this_line);
    }
};

Socket.prototype.process_end = function () {
    if (this.current_data.length)
        this.emit('line', this.current_data)
    this.current_data = '';
};
