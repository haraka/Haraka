"use strict";
// Various utility functions
var isIPv4 = require('net').isIPv4;

// copied from http://www.broofa.com/Tools/Math.uuid.js
var CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('');

exports.uuid = function () {
    var chars = CHARS, uuid = new Array(36), rnd=0, r;
    for (var i = 0; i < 36; i++) {
        if (i==8 || i==13 ||  i==18 || i==23) {
            uuid[i] = '-';
        } 
        else if (i==14) {
            uuid[i] = '4';
        }
        else {
            if (rnd <= 0x02) rnd = 0x2000000 + (Math.random()*0x1000000)|0;
            r = rnd & 0xf;
            rnd = rnd >> 4;
            uuid[i] = chars[(i == 19) ? (r & 0x3) | 0x8 : r];
        }
    }
    return uuid.join('');
};

exports.in_array = function (item, array) {
    for (var i in array) {
        if (item === array[i]) {
            return true;
        }
    }
    return false;
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
        else if (out[o] != arr[i]) {
            out.push(arr[i]);
            o++;
        }
    }
    return out;
}

exports.ISODate = function (d) {
   function pad(n) {return n<10 ? '0'+n : n}
   return d.getUTCFullYear()+'-'
      + pad(d.getUTCMonth()+1)+'-'
      + pad(d.getUTCDate())+'T'
      + pad(d.getUTCHours())+':'
      + pad(d.getUTCMinutes())+':'
      + pad(d.getUTCSeconds())+'Z'
}

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
}

exports.ip_to_long = function (ip) {
    if (!isIPv4(ip)) {
        return false;
    }
    else {
        var d = ip.split('.');
        return ((((((+d[0])*256)+(+d[1]))*256)+(+d[2]))*256)+(+d[3]);
    }
}

exports.long_to_ip = function (n) {
    var d = n%256;
    for (var i=3; i>0; i--) { 
        num = Math.floor(num/256);
        d = num%256 + '.' + d;
    }
    return d;
}

exports.dec_to_hex = function (d) {
    return d.toString(16);
}

exports.hex_to_dec = function (h) {
    return parseInt(h, 16);
}

exports.ip_in_str = function(ip, str) {
    var tlds = require('./tlds');
    // Only IPv4 for now
    if (isIPv4(ip)) {
        var host_part = (tlds.split_hostname(str))[0].toLowerCase();
        var ip_split = ip.split('.');
        // 3rd and 4th octets
        if ((host_part.indexOf(ip_split[2]) !== -1) && (host_part.indexOf(ip_split[3]) !== -1)) {
            return true;
        }
        // 1st and 2nd octets
        if ((host_part.indexOf(ip_split[0]) !== -1) && (host_part.indexOf(ip_split[1]) !== -1)) {
            return true;
        }
        var ip_hex = this.dec_to_hex(this.ip_to_long(ip));
        // Whole IP in hex
        if ( (host_part.indexOf(ip_hex[0] + ip_hex[1]) !== -1) &&
             (host_part.indexOf(ip_hex[2] + ip_hex[3]) !== -1) &&
             (host_part.indexOf(ip_hex[4] + ip_hex[5]) !== -1) &&
             (host_part.indexOf(ip_hex[6] + ip_hex[7]) !== -1) )
        {
            return true;
        }
    }
    return false;
}
