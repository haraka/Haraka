"use strict";
// An RFC 2822 email header parser
var logger = require('./logger');
var utils  = require('./utils');
var iconv  = require('iconv-lite');

function Header (options) {
    this.headers = {};
    this.headers_decoded = {};
    this.header_list = [];
    this.options = options;
};

exports.Header = Header;

Header.prototype.parse = function (lines) {
    var self = this;

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

    // Now add decoded versions
    Object.keys(this.headers).forEach(function (key) {
        self.headers[key].forEach(function (val) {
            self._add_header_decode(key, val, "push");
        })
    })
};

var try_convert = exports.try_convert = function (data, encoding) {
    try {
        data = iconv.decode(data, encoding);
    }
    catch (err) {
        // TODO: raise a flag for this for possible scoring?
        logger.logerror("iconv from " + encoding + " to UTF-8 failed: " + err);
    }

    return data;
}

function _decode_header (matched, encoding, cte, data) {
    cte = cte.toUpperCase();
    
    switch(cte) {
        case 'Q':
            data = utils.decode_qp(data.replace(/_/g, ' '));
            break;
        case 'B':
            data = new Buffer(data, "base64");
            break;
        default:
            logger.logerror("Invalid header encoding type: " + cte);
    }
    
    // convert with iconv if encoding != UTF-8
    if (!(/UTF-?8/i.test(encoding))) {
        data = try_convert(data, encoding);
    }
    
    return data.toString();
}

Header.prototype.decode_header = function decode_header (val) {
    // Fold continuations
    val = val.replace(/\n[ \t]+/g, "\n ");
    
    // remove end carriage return
    val = val.replace(/\r?\n$/, '');
    
    if (!/^[\x00-\x7f]*$/.test(val)) {
        // 8 bit values in the header
        var matches = /\bcharset\s*=\s*["']?([\w_\-]*)/.exec(this.get('content-type'));
        if (matches && !/UTF-?8/i.test(matches[1])) {
            var encoding = matches[1];
            var source = new Buffer(val, 'binary');
            val = try_convert(source, encoding).toString();
        }
    }

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
};

Header.prototype._add_header_decode = function (key, value, method) {
    this.headers_decoded[key] = this.headers_decoded[key] || [];
    this.headers_decoded[key][method](this.decode_header(value));
}

Header.prototype.add = function (key, value) {
    if (!key) key = 'X-Haraka-Blank';
    value = value.replace(/(\r?\n)*$/, '');
    this._add_header(key.toLowerCase(), value, "unshift");
    this._add_header_decode(key.toLowerCase(), value, "unshift");
    this.header_list.unshift(key + ': ' + value + '\n');
};

Header.prototype.add_end = function (key, value) {
    if (!key) key = 'X-Haraka-Blank';
    value = value.replace(/(\r?\n)*$/, '');
    this._add_header(key.toLowerCase(), value, "push");
    this._add_header_decode(key.toLowerCase(), value, "push");
    this.header_list.push(key + ': ' + value + '\n');
}

Header.prototype.lines = function () {
    return this.header_list;
};

Header.prototype.toString = function () {
    return this.header_list.join("\n");
};
