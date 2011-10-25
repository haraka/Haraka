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

// All scanadlously taken from http://ipv6blog.net/ipv6-validation-javascript/
// substr_count
//
// Support function; a javascript version of an original PHP function
// Found at: http://kevin.vanzonneveld.net

function substr_count (haystack, needle, offset, length) {
    var pos = 0, cnt = 0;

    haystack += '';
    needle += '';
    if (isNaN(offset)) {offset = 0;}
    if (isNaN(length)) {length = 0;}
    offset--;

    while ((offset = haystack.indexOf(needle, offset+1)) != -1) {
        if (length > 0 && (offset+needle.length) > length) {
            return false;
        }
        else {
            cnt++;
        }
    }

    return cnt;
}

// is_ipv4
//
// Test for a valid dotted IPv4 address
//
// Ported from: http://www.dijksterhuis.org/regular-expressions-csharp-practical-use/
var is_ipv4 = exports.is_ipv4 = function (ip) {
   var match = ip.match(/^(([1-9]?[0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([1-9]?[0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$/);
   return match != null;
}

// is_ipv6
//
// Test if the input is a valid ipv6 address. Javascript version of an original PHP function.
//
// Ported from: http://crisp.tweakblogs.net/blog/2031

exports.is_ipv6 = function (ip) {
    // Test for empty address
    if (ip.length<3) {
        return ip === "::";
    }

    // Check if part is in IPv4 format
    if (ip.indexOf('.')>0) {
        lastcolon = ip.lastIndexOf(':');

        if (!(lastcolon && is_ipv4(ip.substr(lastcolon + 1))))
            return false;

        // replace IPv4 part with dummy
        ip = ip.substr(0, lastcolon) + ':0:0';
    }

    // Check uncompressed
    if (ip.indexOf('::')<0) {
        var match = ip.match(/^(?:[a-f0-9]{1,4}:){7}[a-f0-9]{1,4}$/i);
        return match !== null;
    }

    // Check colon-count for compressed format
    if (substr_count(ip, ':') < 8) {
        var match = ip.match(/^(?::|(?:[a-f0-9]{1,4}:)+):(?:(?:[a-f0-9]{1,4}:)*[a-f0-9]{1,4})?$/i);
        return match !== null;
    }

    // Not a valid IPv6 address
    return false;
}

exports.expand_ipv6 = function (ip) {
    function pad(n) {return (new Array(5-n.length).join('0'))+n}
    if (ip.indexOf('::')>=0) {
        // Sigh, magic number time, we want 7 colons in the final string
        // We count the number of colons that are already there to decide how many to add (7 - count)
        // We then reduce the count by two (7 - (count - 2)) because of the double colon
        // The are prefixing the replacement with a colon so remove one (7 - (count - 2) - 1)
        // and then we add one for the size of the array (7 - (count - 2) - 1 + 1)
        ip = ip.replace('::', ':' + new Array(9 - substr_count(ip, ':')).join('0:'));
    }
    var gobbles = ip.split(':');
    for (var gobble=0; gobble < 8; gobble++) {
        gobbles[gobble]=pad(gobbles[gobble]);
    }
    return gobbles.join(':');
}
