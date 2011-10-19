"use strict";
// Various utility functions

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
