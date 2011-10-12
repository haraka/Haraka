/**
 * @@ Standard Header @@
 */

// Various utility functions

// ---------------------------------------------------------------------------------
// UUID function copied from http://www.broofa.com/Tools/Math.uuid.js
// ---------------------------------------------------------------------------------

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

/**
 * @param item The search item
 * @param array The array to search for the item
 * @return true, if found, else false
 */
exports.in_array = function (item, array) {
    for (var i in array) {
        if (item === array[i]) {
            return true;
        }
    }
    return false;
};

/**
 * @param obj The relevant obj to introspect
 * @return A sorted list of all keys of 'obj'
 */
exports.sort_keys = function (obj) {
    return Object.keys(obj).sort();
};

/**
 * @param arr The input array. The array must already be sorted.
 * @return Same as 'arr' but without any dublicates
 */
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

/**
 * Provide ISO compliant string representation of the date provided.
 * 
 * @param d Date
 * @return ISO date string representation
 */
exports.ISODate = function (d) {
   function pad(n) {return n<10 ? '0'+n : n}
   return d.getUTCFullYear()+'-'
      + pad(d.getUTCMonth()+1)+'-'
      + pad(d.getUTCDate())+'T'
      + pad(d.getUTCHours())+':'
      + pad(d.getUTCMinutes())+':'
      + pad(d.getUTCSeconds())+'Z'
}
