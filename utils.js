'use strict';

// copied from http://www.broofa.com/Tools/Math.uuid.js
var CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
    .split('');

exports.uuid = function () {
    var chars = CHARS;
    var uuid = new Array(36);
    var rnd=0;
    var r;
    for (var i = 0; i < 36; i++) {
        if (i===8 || i===13 || i===18 || i===23) {
            uuid[i] = '-';
        }
        else if (i===14) {
            uuid[i] = '4';
        }
        else {
            if (rnd <= 0x02) rnd = 0x2000000 + (Math.random()*0x1000000)|0;
            r = rnd & 0xf;
            rnd = rnd >> 4;
            uuid[i] = chars[(i === 19) ? (r & 0x3) | 0x8 : r];
        }
    }
    return uuid.join('');
};

exports.in_array = function (item, array) {
    if (!array) return false;
    if (!Array.isArray(array)) return false;
    return (array.indexOf(item) !== -1);
};

exports.to_object = function (array) {
    if (typeof array === 'string') {
        array = array.split(/[\s,;]+/);
    }
    if (!Array.isArray(array)) {
        throw "arguments to to_object must be a string or array";
    }
    var rv = {};
    for (var i = 0; i < array.length; i++) {
        if (array[i] === undefined) { continue; }
        rv[array[i]] = true;
    }
    return rv;
};

exports.sort_keys = function (obj) {
    return Object.keys(obj).sort();
};

exports.uniq = function (arr) {
    var out = [];
    var o = 0;
    for (var i=0,l=arr.length; i < l; i++) {
        if (out.length === 0) {
            out.push(arr[i]);
        }
        else if (out[o] !== arr[i]) {
            out.push(arr[i]);
            o++;
        }
    }
    return out;
};

exports.extend = function (target) {
    // http://stackoverflow.com/questions/14974864/
    var sources = [].slice.call(arguments, 1);
    sources.forEach(function (source) {
        for (var prop in source) {
            target[prop] = source[prop];
        }
    });
    return target;
};

exports.ISODate = function (d) {
    function pad(n) { return n<10 ? '0'+n : n; }
    return d.getUTCFullYear()+'-' +
      pad(d.getUTCMonth()+1)+'-' +
      pad(d.getUTCDate())+'T'    +
      pad(d.getUTCHours())+':'   +
      pad(d.getUTCMinutes())+':' +
      pad(d.getUTCSeconds())+'Z' ;
};

var _daynames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
var _monnames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function _pad (num, n, p) {
    var s = '' + num;
    p = p || '0';
    while (s.length < n) s = p + s;
    return s;
}

exports.pad = _pad;

exports.date_to_str = function (d) {
    return _daynames[d.getDay()] + ', ' + _pad(d.getDate(),2) + ' ' +
           _monnames[d.getMonth()] + ' ' + d.getFullYear() + ' ' +
           _pad(d.getHours(),2) + ':' + _pad(d.getMinutes(),2) + ':' +
           _pad(d.getSeconds(),2) +
           ' ' + d.toString().match(/\sGMT([+-]\d+)/)[1];
};

exports.decode_qp = function (line) {
    line = line.replace(/\r\n/g,"\n").replace(/[ \t]+\r?\n/g,"\n");
    if (! /=/.test(line)) {
        // this may be a pointless optimisation...
        return new Buffer(line);
    }
    line = line.replace(/=\n/mg, '');
    var buf = new Buffer(line.length);
    var pos = 0;
    for (var i=0,l=line.length; i < l; i++) {
        if (line[i] === '=' &&
            /=[0-9a-fA-F]{2}/.test(line[i] + line[i+1] + line[i+2])) {
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
};

function _char_to_qp (ch) {
    var b = new Buffer(ch);
    return _buf_to_qp(b);
}

function _buf_to_qp (b) {
    var r = '';
    for (var i=0; i<b.length; i++) {
        if ((b[i] != 61) && ((b[i] > 32 && b[i] <= 126) || b[i] == 10 || b[i] == 13)) {
            // printable range
            r = r + String.fromCharCode(b[i]);
        }
        else {
            r = r + '=' + _pad(b[i].toString(16).toUpperCase(), 2);
        }
    }
    return r;
}

// Shameless attempt to copy from Perl's MIME::QuotedPrint::Perl code.
exports.encode_qp = function (str) {
    str = Buffer.isBuffer(str) ? _buf_to_qp(str)
        : str.replace(
        /([^\ \t\n!"#\$%&'()*+,\-.\/0-9:;<>?\@A-Z\[\\\]^_`a-z{|}~])/g,
        function (orig, p1) {
            return _char_to_qp(p1);
        }
    ).replace(/([ \t]+)$/gm, function (orig, p1) {
        return p1.split('').map(_char_to_qp).join('');
    });

    // Now shorten lines to 76 chars, but don't break =XX encodes.
    // Method: iterate over to char 73.
    //   If char 74, 75 or 76 is = we need to break before the =.
    //   Otherwise break at 76.
    var cur_length = 0;
    var out = '';
    for (var i=0; i<str.length; i++) {
        if (str[i] === '\n') {
            out += '\n';
            cur_length = 0;
            continue;
        }

        cur_length++;
        if (cur_length <= 73) {
            out += str[i];
        }
        else if (cur_length > 73 && cur_length < 76) {
            if (str[i] === '=') {
                out += '=\n=';
                cur_length = 1;
            }
            else {
                out += str[i];
            }
        }
        else {
            // Otherwise got to char 76

            // Don't insert '=\n' if end of string or next char is already \n:
            if ((i === (str.length - 1)) || (str[i+1] === '\n')) {
                out += str[i];
            }
            else {
                out += '=\n' + str[i];
                cur_length = 1;
            }
        }
    }

    return out;
};

exports.node_min = function (min, cur) {
    var wants = min.split('.');
    var has = (cur || process.version.substring(1)).split('.');

    for (var i=0; i<=3; i++) {
        // note use of unary + for fast type conversion to num
        if (+has[i] > +wants[i]) { return true;  }
        if (+has[i] < +wants[i]) { return false; }
    }

    // they're identical
    return true;
};

exports.existsSync =
    require(exports.node_min('0.8') ? 'fs' : 'path').existsSync;

exports.indexOfLF = function (buf, maxlength) {
    for (var i=0; i<buf.length; i++) {
        if (maxlength && (i === maxlength)) break;
        if (buf[i] === 0x0a) return i;
    }
    return -1;
};

exports.prettySize = function (size) {
    if (size === 0 || !size) return 0;
    var i = Math.floor(Math.log(size)/Math.log(1024));
    var units = ['B', 'kB', 'MB', 'GB', 'TB'];
    return (size/Math.pow(1024,i)).toFixed(2) * 1 + '' + units[i];
};

exports.valid_regexes = function (list, file) {
    // list: an array of regexes. file: the file name containing the regex list
    var valid = [];
    for (var i=0; i<list.length; i++) {
        try {
            new RegExp(list[i]);
        }
        catch (e) {
            require('./logger')
                .logerror("invalid regex in " + file + ", " + list[i]);
            continue;
        }
        valid.push(list[i]);
    }
    return valid;  // returns a list of valid regexes
};

exports.regexp_escape = function(text) {
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
};

exports.base64 = function (str) {
    return new Buffer(str, "UTF-8").toString("base64");
};

exports.unbase64 = function (str) {
    return new Buffer(str, "base64").toString("UTF-8");
};

// Fisher-Yates shuffle
// http://bost.ocks.org/mike/shuffle/
exports.shuffle = function(array) {
    var m = array.length;
    var t;
    var i;

    // While there remain elements to shuffle…
    while (m) {
        // Pick a remaining element…
        i = Math.floor(Math.random() * m--);

        // And swap it with the current element.
        t = array[m];
        array[m] = array[i];
        array[i] = t;
    }

    return array;
};

exports.elapsed = function (start, decimal_places) {
    var diff = (Date.now() - start) / 1000;  // in seconds

    if (decimal_places === undefined) {
        decimal_places = diff > 5 ? 0 : diff > 2 ? 1 : 2;
    }
    else {
        decimal_places = parseInt(decimal_places);
        if (isNaN(decimal_places)) {
            decimal_places = 2;
        }
    }
    return diff.toFixed(decimal_places);
};

exports.wildcard_to_regexp = function (str) {
    return str
        .replace(/[-\[\]\/{}()*+?.,\\^$|#\s]/g, "\\$&")
        .replace('\\*', '.*')
        .replace('\\?', '.') + '$';
};

exports.line_regexp = /^([^\n]*\n)/;
