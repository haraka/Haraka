"use strict";
// An RFC 2822 email header parser
var logger = require('./logger');
var Iconv;
try { Iconv = require('iconv').Iconv }
catch (err) {
    logger.logdebug("No iconv available - install with 'npm install iconv'");
}

function Header (options) {
    this.headers = {};
    this.headers_decoded = {};
    this.header_list = [];
    this.options = options;
};

exports.Header = Header;
exports.Iconv  = Iconv;
exports.decode_qp = function (line) {
    if (! /=/.test(line)) {
        // this may be a pointless optimisation...
        return new Buffer(line);
    }
    line = line.replace(/=\n/mg, '');
    var buf = new Buffer(line.length);
    var pos = 0;
    for (var i=0,l=line.length; i < l; i++) {
        if (line[i] === '=') {
            i++;
            buf[pos] = parseInt(line[i] + line[i+1], 16);
            i++;
        }
        else {
            buf[pos] = line.charCodeAt(i);
        }
        pos++;
    }
    return buf.slice(0, pos);
}

Header.prototype.parse = function (lines) {
    for (var i=0,l=lines.length; i < l; i++) {
        var line = lines[i];
        if (line.match(/^[ \t]/)) {
            // continuation
            this.header_list[this.header_list.length - 1] += line;
        }
        else {
            this.header_list.push(line);
        }
    }
        
    for (var i=0,l=this.header_list.length; i < l; i++) {
        var match = this.header_list[i].match(/^([^:]*):\s*([\s\S]*)$/);
        if (match) {
            var key = match[1].toLowerCase();
            var val = match[2];
            
            this._add_header(key, val, "push");
        }
        else {
            logger.logerror("Header did not look right: " + this.header_list[i]);
        }
    }
};

function _decode_header (matched, encoding, cte, data) {
    cte = cte.toUpperCase();
    
    switch(cte) {
        case 'Q':
            data = exports.decode_qp(data.replace(/_/g, ' '));
            break;
        case 'B':
            data = new Buffer(data, "base64");
            break;
        default:
            logger.logerror("Invalid header encoding type: " + cte);
    }
    
    // todo: convert with iconv if encoding != UTF-8
    if (Iconv) {
        try {
            var converter = new Iconv(encoding, "UTF-8");
            // console.log(data.toString());
            data = converter.convert(data);
        }
        catch (err) {
            logger.logerror("header iconv conversion from " + encoding + " to UTF-8 failed: " + err);
        }
    }
    
    return data.toString();
}

function decode_header (val) {
    // Fold continuations
    val = val.replace(/\n[ \t]+/g, "\n ");
    
    // remove end carriage return
    val = val.replace(/\r?\n$/, '');
    
    if (! (/=\?/.test(val)) ) {
        // no encoded stuff
        return val;
    }
    
    val = val.replace(/=\?([\w_-]+)\?([bqBQ])\?(.*?)\?=/g, _decode_header);
    
    return val;
}

Header.prototype.get = function (key) {
    return (this.headers[key.toLowerCase()] || []).join("\n");
};

Header.prototype.get_all = function (key) {
    return this.headers[key.toLowerCase()] || [];
};

Header.prototype.get_decoded = function (key) {
    return (this.headers_decoded[key.toLowerCase()] || []).join("\n");
};

Header.prototype.remove = function (key) {
    key = key.toLowerCase();
    delete this.headers[key];
    delete this.headers_decoded[key];
    
    this._remove_more(key);
}

Header.prototype._remove_more = function (key) {
    var key_len = key.length;
    var to_remove;
    for (var i=0,l=this.header_list.length; i < l; i++) {
        if (this.header_list[i].substring(0, key_len).toLowerCase() === key) {
            this.header_list.splice(i, 1);
            return this._remove_more(key);
        }
    }
};

Header.prototype._add_header = function (key, value, method) {
    this.headers[key] = this.headers[key] || [];
    this.headers[key][method](value);
    this.headers_decoded[key] = this.headers_decoded[key] || [];
    this.headers_decoded[key][method](decode_header(value));
};

Header.prototype.add = function (key, value) {
    this._add_header(key.toLowerCase(), value, "unshift");
    this.header_list.unshift(key + ': ' + value + '\n');
};

Header.prototype.add_end = function (key, value) {
    this._add_header(key.toLowerCase(), value, "push");
    this.header_list.push(key + ': ' + value + '\n');
}

Header.prototype.lines = function () {
    return this.header_list;
};

Header.prototype.toString = function () {
    return this.header_list.join("\n");
};
