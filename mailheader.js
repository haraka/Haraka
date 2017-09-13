'use strict';
// An RFC 2822 email header parser
/* eslint no-control-regex: 0 */

const logger = require('./logger');
const utils  = require('haraka-utils');
let Iconv;
try { Iconv = require('iconv').Iconv }
catch (err) {
    logger.logdebug("No iconv available - install with 'npm install iconv'");
}

function Header (options) {
    this.headers = {};
    this.headers_decoded = {};
    this.header_list = [];
    this.options = options;
}

exports.Header = Header;
exports.Iconv  = Iconv;

Header.prototype.parse = function (lines) {
    const self = this;

    for (let i=0,l=lines.length; i < l; i++) {
        const line = lines[i];
        if (/^[ \t]/.test(line)) {
            // continuation
            this.header_list[this.header_list.length - 1] += line;
        }
        else {
            this.header_list.push(line);
        }
    }

    for (let i=0,l=this.header_list.length; i < l; i++) {
        const match = this.header_list[i].match(/^([^\s:]*):\s*([\s\S]*)$/);
        if (match) {
            const key = match[1].toLowerCase();
            const val = match[2];

            this._add_header(key, val, "push");
        }
        else {
            logger.logerror("Header did not look right: " + this.header_list[i]);
        }
    }

    // Now add decoded versions
    Object.keys(this.headers).forEach((key2) => {
        self.headers[key2].forEach((val2) => {
            self._add_header_decode(key2, val2, 'push');
        })
    })
};

function try_convert (data, encoding) {
    try {
        const converter = new Iconv(encoding, "UTF-8");
        data = converter.convert(data);
    }
    catch (err) {
        // TODO: raise a flag for this for possible scoring
        logger.logwarn("initial iconv conversion from " + encoding + " to UTF-8 failed: " + err.message);
        if (err.code !== 'EINVAL') {
            try {
                const converter = new Iconv(encoding, "UTF-8//TRANSLIT//IGNORE");
                data = converter.convert(data);
            }
            catch (e) {
                logger.logerror("iconv from " + encoding + " to UTF-8 failed: " + e.message);
            }
        }
    }

    return data;
}

function _decode_header (matched, encoding, lang, cte, data) {
    cte = cte.toUpperCase();

    switch (cte) {
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
    if (Iconv && !(/UTF-?8/i.test(encoding))) {
        data = try_convert(data, encoding);
    }

    return data.toString();
}

function _decode_rfc2231 (params, str) {
    /*
    To explain the regexp below, the params are:

    parameter := attribute "=" value

    attribute := token
                 ; Matching of attributes
                 ; is ALWAYS case-insensitive.

    token := 1*<any (US-ASCII) CHAR except SPACE, CTLs,
                or tspecials>

    tspecials :=  "(" / ")" / "<" / ">" / "@" /
                  "," / ";" / ":" / "\" / <">
                  "/" / "[" / "]" / "?" / "="
                  ; Must be in quoted-string,
                  ; to use within parameter values
    */
    const sub_matches = /(([!#$%&'*+.0-9A-Zdiff^_`a-z{|}~-]*)\*)(\d*)=(\s*".*?[^\\]";?|\S*)/.exec(str);
    if (!sub_matches) {
        return;
    }
    const key = sub_matches[1];
    let key_actual = sub_matches[2];
    let key_id = sub_matches[3] || '0';
    let value = sub_matches[4].replace(/;$/, '');

    str = str.replace(sub_matches[0], ''); // strip it out, so we move to next

    const key_extract = /^(.*?)(\*(\d+)\*)$/.exec(key);
    if (key_extract) {
        key_actual = key_extract[1];
        key_id = key_extract[3];
    }

    const quote = /^\s*"(.*)"$/.exec(value);
    if (quote) {
        value = quote[1];
    }

    const lang_match = /^(.*?)'(.*?)'(.*)/.exec(value);
    if (lang_match) {
        if (key_actual == params.cur_key && lang_match[2] != params.cur_lang) {
            return _decode_rfc2231(params, str); // same key, different lang, throw it away
        }
        params.cur_enc = lang_match[1];
        params.cur_lang = lang_match[2];
        value = lang_match[3];
    }
    else if (key_actual != params.cur_key) {
        params.cur_lang = '';
        params.cur_enc = '';
    }

    params.cur_key = key_actual;
    params.keys[key_actual] = '';
    try {
        value = decodeURIComponent(value);
    }
    catch (e) {
        logger.logerror("Decode header failed: " + key + ": " + value);
    }
    params.kv[key_actual + '*' + key_id] = params.cur_enc ? try_convert(value, params.cur_enc) : value;
    return _decode_rfc2231(params, str); // Get next one
}

Header.prototype.decode_header = function decode_header (val) {
    // Fold continuations
    val = val.replace(/\r?\n/g, '');

    const rfc2231_params = {
        kv: {},
        keys: {},
        cur_key: '',
        cur_enc: '',
        cur_lang: '', // Secondary languages are ignored for our purposes
    };

    _decode_rfc2231(rfc2231_params, val);

    // console.log(rfc2231_params);

    for (const key in rfc2231_params.keys) {
        val = val + ' ' + key + '="';
        /* eslint no-constant-condition: 0 */
        for (let i=0; true; i++) {
            const _key = key + '*' + i;
            const _val = rfc2231_params.kv[_key];
            if (_val === undefined) break;
            val = val + _val;
        }
        val = val + '";';
    }

    // strip 822 comments in the most basic way - does not support nested comments
    // val = val.replace(/\([^\)]*\)/, '');

    if (Iconv && !/^[\x00-\x7f]*$/.test(val)) {
        // 8 bit values in the header
        const matches = /\bcharset\s*=\s*["']?([\w_-]*)/.exec(this.get('content-type'));
        if (matches && !/UTF-?8/i.test(matches[1])) {
            const encoding = matches[1];
            const source = new Buffer(val, 'binary');
            val = try_convert(source, encoding).toString();
        }
    }

    if (! (/=\?/.test(val)) ) {
        // no encoded stuff
        return val;
    }

    val = val.replace(/=\?([\w_-]+)(\*[\w_-]+)?\?([bqBQ])\?([\s\S]*?)\?=/g, _decode_header);

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
    const key_len = key.length;
    for (let i=0,l=this.header_list.length; i < l; i++) {
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
    const val = this.decode_header(value);
    // console.log(key + ': ' + val);
    this.headers_decoded[key] = this.headers_decoded[key] || [];
    this.headers_decoded[key][method](val);
}

Header.prototype.add = function (key, value) {
    if (!key) key = 'X-Haraka-Blank';
    value = value.replace(/(\r?\n)*$/, '');
    if (/[^\x00-\x7f]/.test(value)) {
        // Need to QP encode this header value and assume UTF-8
        value = '=?UTF-8?q?' + utils.encode_qp(value) + '?=';
        value = value.replace(/=\n/g, ''); // remove wraps - headers can only wrap at whitespace (with continuations)
    }
    this._add_header(key.toLowerCase(), value, "unshift");
    this._add_header_decode(key.toLowerCase(), value, "unshift");
    this.header_list.unshift(key + ': ' + value + '\n');
};

Header.prototype.add_end = function (key, value) {
    if (!key) key = 'X-Haraka-Blank';
    value = value.replace(/(\r?\n)*$/, '');
    if (/[^\x00-\x7f]/.test(value)) {
        // Need to QP encode this header value and assume UTF-8
        value = '=?UTF-8?q?' + utils.encode_qp(value) + '?=';
        value = value.replace(/=\n/g, ''); // remove wraps - headers can only wrap at whitespace (with continuations)
    }
    this._add_header(key.toLowerCase(), value, "push");
    this._add_header_decode(key.toLowerCase(), value, "push");
    this.header_list.push(key + ': ' + value + '\n');
}

Header.prototype.lines = function () {
    return this.header_list;
}

Header.prototype.toString = function () {
    return this.header_list.join("\n");
}
