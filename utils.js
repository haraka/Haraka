'use strict';

// copied from http://www.broofa.com/Tools/Math.uuid.js
var CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('');

exports.uuid = function () {
    var chars = CHARS, uuid = new Array(36), rnd=0, r;
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
    return (array.indexOf(item) !== -1);
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
var _monnames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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
           _pad(d.getHours(),2) + ':' + _pad(d.getMinutes(),2) + ':' + _pad(d.getSeconds(),2) +
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
    return "=" + _pad(ch.charCodeAt(0).toString(16).toUpperCase(), 2);
}

// Shameless attempt to copy from Perl's MIME::QuotedPrint::Perl code.
exports.encode_qp = function (str) {
    str = str.replace(/([^\ \t\n!"#\$%&'()*+,\-.\/0-9:;<>?\@A-Z\[\\\]^_`a-z{|}~])/g, function (orig, p1) {
        return _char_to_qp(p1);
    }).replace(/([ \t]+)$/gm, function (orig, p1) {
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

var versions   = process.version.split('.'),
    version    = Number(versions[0].substring(1)),
    subversion = Number(versions[1]);

exports.existsSync = require((version > 0 || subversion >= 8) ? 'fs' : 'path').existsSync;

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
            require('./logger').logerror("invalid regex in " + file + ", " + list[i]);
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
