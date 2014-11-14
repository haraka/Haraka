'use strict';
// spf

var dns = require('dns');
var util = require('util');
var ipaddr = require('ipaddr.js');

// Constructor
function SPF(count, been_there) {
    // For macro expansion
    // This should be set before check_host() is called
    this.helo = 'unknown';
    this.spf_record = '';

    // RFC 4408 Section 10.1
    // Limit the number of mechanisms/modifiers
    // the require DNS lookups to complete.
    this.count = 0;
    // If we have recursed we are supplied the count
    if (count) {
        this.count = count;
    }

    // Prevent circular references
    // This isn't covered in the RFC...
    this.been_there = {};
    if (been_there) {
        this.been_there = been_there;
    }
}

// RFC 4408 Section 10.1
SPF.prototype.LIMIT = 10;

// Constants
SPF.prototype.SPF_NONE = 1;
SPF.prototype.SPF_PASS = 2;
SPF.prototype.SPF_FAIL = 3;
SPF.prototype.SPF_SOFTFAIL = 4;
SPF.prototype.SPF_NEUTRAL = 5;
SPF.prototype.SPF_TEMPERROR = 6;
SPF.prototype.SPF_PERMERROR = 7;

SPF.prototype.const_translate = function (value) {
    var t = {};
    for (var k in this) {
        if (typeof this[k] === 'number') {
            t[this[k]] = k.toUpperCase();
        }
    }
    if (t[value]) return t[value];
    return 'UNKNOWN';
};

SPF.prototype.result = function (value) {
    switch (value) {
        case this.SPF_NONE:      return 'None';
        case this.SPF_PASS:      return 'Pass';
        case this.SPF_FAIL:      return 'Fail';
        case this.SPF_SOFTFAIL:  return 'SoftFail';
        case this.SPF_NEUTRAL:   return 'Neutral';
        case this.SPF_TEMPERROR: return 'TempError';
        case this.SPF_PERMERROR: return 'PermError';
        default:                 return 'Unknown (' + value + ')';
    }
};

SPF.prototype.return_const = function (qualifier) {
    switch (qualifier) {
        case '+':   return this.SPF_PASS;
        case '-':   return this.SPF_FAIL;
        case '~':   return this.SPF_SOFTFAIL;
        case '?':   return this.SPF_NEUTRAL;
        default:    return this.SPF_PERMERROR;
    }
};

SPF.prototype.expand_macros = function (str) {
    var macro = /%{([slodipvh])((?:(?:\d+)?r?)?)?([-.+,/_=])?}/ig;
    var match;
    while (match = macro.exec(str)) {
        // match[1] = macro-letter
        // match[2] = transformers
        // match[3] = delimiter
        if (!match[3]) match[3] = '.';
        var strip = /(\d+)/.exec(match[2]);
        if (strip) {
            strip = strip[1];
        }
        var reverse = ((('' + match[2]).indexOf('r')) !== -1 ? true : false);
        var replace, kind;
        switch (match[1]) {
            case 's':   // sender
                replace = this.mail_from;
                break;
            case 'l':   // local-part of sender
                replace = (this.mail_from.split('@'))[0];
                break;
            case 'o':   // domain of sender
                replace = (this.mail_from.split('@'))[1];
                break;
            case 'd':   // domain
                replace = this.domain;
                break;
            case 'i':   // IP
                replace = this.ip;
                break;
            case 'p':   // validated domain name of IP
                // NOT IMPLEMENTED
                replace = 'unknown';
                break;
            case 'v':   // IP version
                try {
                    if (this.ip_ver === 'ipv4') kind = 'in-addr';
                    if (this.ip_ver === 'ipv6') kind = 'ip6';
                    replace = kind;
                }
                catch (e) {}
                break;
            case 'h':   // EHLO/HELO domain
                replace = this.helo;
                break;
        }
        // Process any transformers
        if (replace) {
            if (reverse || strip) {
                replace = replace.split(match[3]);
                if (strip) {
                    strip = ((strip > replace.length) ? replace.length : strip);
                    replace = replace.slice(0,strip);
                }
                if (reverse) replace = replace.reverse();
                replace = replace.join('.');
            }
            str = str.replace(match[0], replace);
        }
    }
    // Process any other expansions
    str = str.replace(/%%/g, '%');
    str = str.replace(/%_/g, ' ');
    str = str.replace(/%-/g, '%20');
    return str;
};

SPF.prototype.log_debug = function (str) {
    util.debug(str);
};

SPF.prototype.check_host = function (ip, domain, mail_from, cb) {
    var self = this;
    domain = domain.toLowerCase();
    if (mail_from) {
        mail_from = mail_from.toLowerCase();
    }
    else {
        mail_from = 'postmaster@' + domain;
    }
    this.ipaddr = ipaddr.parse(ip);
    this.ip_ver = this.ipaddr.kind();
    if (this.ip_ver === 'ipv6') {
        this.ip = this.ipaddr.toString();
    }
    else {
        this.ip = ip;
    }
    this.domain = domain;
    this.mail_from = mail_from;

    this.log_debug('ip=' + ip + ' domain=' + domain + ' mail_from=' + mail_from);
    // Get the SPF record for domain
    dns.resolveTxt(domain, function (err, txt_rrs) {
        if (err) {
            self.log_debug('error looking up TXT record: ' + err.message);
            switch (err.code) {
                case 'ENOTFOUND':
                case 'ENODATA':
                case dns.NXDOMAIN:  return cb(null, self.SPF_NONE);
                default:            return cb(null, self.SPF_TEMPERROR);
            }
        }

        var i, spf_record, match;
        for (i=0; i < txt_rrs.length; i++) {
            // Node 0.11.x compatibility
            if (Array.isArray(txt_rrs[i])) {
                txt_rrs[i] = txt_rrs[i].join('');
            }
            match = /^(v=spf1(?:$|\s.+$))/i.exec(txt_rrs[i]);
            if (match) {
                if (!spf_record) {
                    self.log_debug('found SPF record for domain ' + domain + ': ' + match[1]);
                    spf_record = match[1].replace(/\s+/, ' ').toLowerCase();
                }
                else {
                    // We've already found an MX record
                    self.log_debug('found additional SPF record for domain ' + domain + ': ' + match[1]);
                    return cb(null, self.SPF_PERMERROR);
                }                
            }
            else {
                self.log_debug('discarding TXT record: ' + txt_rrs[i]);
            }
        }

        if (!spf_record) {
            // No SPF record found?
            return cb(null, self.SPF_NONE);
        }

        // Store the SPF record we used in the object
        self.spf_record = spf_record;

        // Validate SPF record and build call chain
        var mech_array = [];
        var mod_array = [];
        var mech_regexp1 = /^([-+~?])?(all|a|mx|ptr)$/;
        var mech_regexp2 = /^([-+~?])?(a|mx|ptr|ip4|ip6|include|exists)((?::[^\/ ]+(?:\/\d+(?:\/\/\d+)?)?)|\/\d+(?:\/\/\d+)?)$/;
        var mod_regexp = /^([^ =]+)=([a-z0-9._-]+)$/;
        var split = spf_record.split(' ');
        for (i=1; i<split.length; i++) {
            // Skip blanks
            var obj;
            if (!split[i]) continue;
            if (match = (mech_regexp1.exec(split[i]) || mech_regexp2.exec(split[i]))) {
                // match[1] = qualifier
                // match[2] = mechanism
                // match[3] = optional args
                if (!match[1]) match[1] = '+'; 
                self.log_debug('found mechanism: ' + match);
                // Validate IP addresses
                if (match[2] === 'ip4' || match[2] === 'ip6') {
                    var ip_split = /^:([^\/ ]+)(?:\/([^ ]+))?$/.exec(match[3]);
                    // Make sure the IP address is valid
                    if(!ip_split || (ip_split && !ipaddr.isValid(ip_split[1]))) {
                        self.log_debug('invalid IP address: ' + ip_split[1]);
                        return cb(null, self.SPF_PERMERROR);
                    }
                } else {
                    // Validate macro strings
                    if (match[3] && /%[^{%+-]/.exec(match[3])) {
                        self.log_debug('invalid macro string');
                        return cb(null, self.SPF_PERMERROR);
                    }
                    if (match[3]) {
                        // Expand macros
                        match[3] = self.expand_macros(match[3]);
                    }
                }

                obj = {};
                obj[match[2]] = [ match[1], match[3] ];
                mech_array.push(obj);
            }
            else if (match = mod_regexp.exec(split[i])) {
                self.log_debug('found modifier: ' + match);
                // match[1] = modifier
                // match[2] = name
                // Make sure we have a method
                if (!self['mod_' + match[1]]) {
                    self.log_debug('skipping unknown modifier: ' + match[1]);
                }
                else {
                    obj = {};
                    obj[match[1]] = match[2];
                    mod_array.push(obj);
                }
            }
            else {
                // Syntax error
                self.log_debug('syntax error: ' + split[i]);
                return cb(null, self.SPF_PERMERROR);
            }
        }

        self.log_debug('SPF record for \'' + self.domain + '\' validated OK');

        // Set-up modifier run chain
        var mod_chain_caller = function (err, result) {
            // Throw any errors
            if (err) throw err;
            // Check limits
            if (self.count > self.LIMIT) {
                self.log_debug('lookup limit reached');
                return cb(null, self.SPF_PERMERROR);
            } 
            // Return any result that is not SPF_NONE
            if (result && result !== self.SPF_NONE) {
                return cb(err, result);
            }
            if (!mod_array.length) {
                return cb(null, self.SPF_NEUTRAL);
            }
            var next_in_chain = mod_array.shift();
            var func = Object.keys(next_in_chain);
            var args = next_in_chain[func];
            self.log_debug('running modifier: ' + func + ' args=' + args + ' domain=' + self.domain);
            self['mod_' + func](args, mod_chain_caller);
        };

        // Run all the mechanisms first
        var mech_chain_caller = function (err, result) {
            // Throw any errors
            if (err) throw err;
            // Check limits
            if (self.count > self.LIMIT) {
                self.log_debug('lookup limit reached');
                return cb(null, self.SPF_PERMERROR);
            }
            // If we have a result other than SPF_NONE
            if (result && result !== self.SPF_NONE) {
                return cb(err, result);
            }
            // Return default if no more mechanisms to run
            if (!mech_array.length) {
                // Now run any modifiers
                if (mod_array.length) {
                    return mod_chain_caller();
                }
                else {
                    return cb(null, self.SPF_NEUTRAL);
                }
            }
            var next_in_chain = mech_array.shift();
            var func = Object.keys(next_in_chain);
            var args = next_in_chain[func];
            self.log_debug('running mechanism: ' + func + ' args=' + args + ' domain=' + self.domain);
            self['mech_' + func](((args && args.length) ? args[0] : null), ((args && args.length) ? args[1] : null), mech_chain_caller);
        };
        // Start the chain
        mech_chain_caller();
    });
};

SPF.prototype.mech_all = function (qualifier, args, cb) {
    return cb(null, this.return_const(qualifier));
};

SPF.prototype.mech_include = function (qualifier, args, cb) {
    var self = this;
    var domain = args.substr(1);
    // Avoid circular references
    if (this.been_there[domain]) {
        self.log_debug('circular reference detected: ' + domain);
        return cb(null, self.SPF_NONE);
    }
    this.count++;
    this.been_there[domain] = true;
    // Recurse
    var recurse = new SPF(self.count, self.been_there);
    recurse.check_host(self.ip, domain, self.mail_from, function (err, result) {
        if (!err) {
            self.log_debug('mech_include: domain=' + domain + ' returned=' + self.const_translate(result));
            switch (result) {
                case self.SPF_PASS:         return cb(null, self.SPF_PASS);
                case self.SPF_FAIL:
                case self.SPF_SOFTFAIL:
                case self.SPF_NEUTRAL:      return cb(null, self.SPF_NONE);
                case self.SPF_TEMPERROR:    return cb(null, self.SPF_TEMPERROR);
                default:                    return cb(null, self.SPF_PERMERROR);
            }
        }
    });
};

SPF.prototype.mech_exists = function (qualifier, args, cb) {
    var self = this;
    this.count++;
    var exists = args.substr(1);
    dns.resolve(exists, function (err, addrs) {
        if (err) {
            self.log_debug('mech_exists: ' + err);
            switch (err.code) {
                case 'ENOTFOUND':
                case 'ENODATA':
                case dns.NXDOMAIN:
                    return cb(null, self.SPF_NONE);
                default:
                    return cb(null, self.SPF_TEMPERROR);
            }
        }
        self.log_debug('mech_exists: ' + exists + ' result=' + addrs.join(','));
        return cb(null, self.return_const(qualifier));
    });
};

SPF.prototype.mech_a = function (qualifier, args, cb) {
    var self = this;
    this.count++;
    // Parse any arguments
    var cm, cidr4, cidr6;
    if (args && (cm = /\/(\d+)(?:\/\/(\d+))?$/.exec(args))) {
        cidr4 = cm[1];
        cidr6 = cm[2];
    }
    var dm, domain = this.domain;
    if (args && (dm = /^:([^\/ ]+)/.exec(args))) {
        domain = dm[1];
    }
    // Calculate with IP method to use
    var resolve_method;
    var cidr;
    if (this.ip_ver === 'ipv4') {
        cidr = cidr4;
        resolve_method = 'resolve4';
    }
    else if (this.ip_ver === 'ipv6') {
        cidr = cidr6;
        resolve_method = 'resolve6';
    }
    // Use current domain
    dns[resolve_method](domain, function (err, addrs) {
        if (err) {
            self.log_debug('mech_a: ' + err);
            switch (err.code) {
                case 'ENOTFOUND':
                case 'ENODATA':
                case dns.NXDOMAIN:  return cb(null, self.SPF_NONE);
                default:            return cb(null, self.SPF_TEMPERROR);
            }
        }
        for (var a=0; a<addrs.length; a++) {
            if (cidr) {
                // CIDR
                var range = ipaddr.parse(addrs[a]);
                if (self.ipaddr.match(range, cidr)) {
                    self.log_debug('mech_a: ' + self.ip + ' => ' + addrs[a] + '/' + cidr + ': MATCH!');
                    return cb(null, self.return_const(qualifier));
                }
                else {
                    self.log_debug('mech_a: ' + self.ip + ' => ' + addrs[a] + '/' + cidr + ': NO MATCH');
                }
            }
            else {
                if (addrs[a] === self.ip) {
                    return cb(null, self.return_const(qualifier));
                } 
                else {
                    self.log_debug('mech_a: ' + self.ip + ' => ' + addrs[a] + ': NO MATCH');
                }
            }
        }
        return cb(null, self.SPF_NONE);
    });
};

SPF.prototype.mech_mx = function (qualifier, args, cb) {
    var self = this;
    this.count++;
    // Parse any arguments
    var cm, cidr4, cidr6;
    if (args && (cm = /\/(\d+)((?:\/\/(\d+))?)$/.exec(args))) {
        cidr4 = cm[1];
        cidr6 = cm[2];
    }
    var dm, domain = this.domain;
    if (args && (dm = /^:([^\/ ]+)/.exec(args))) {
        domain = dm[1];
    }
    // Fetch the MX records for the specified domain
    dns.resolveMx(domain, function (err, mxes) {
        if (err) {
            switch (err.code) {
                case 'ENOTFOUND':
                case 'ENODATA':
                case dns.NXDOMAIN:  return cb(null, self.SPF_NONE);
                default:            return cb(null, self.SPF_TEMPERROR);
            }
        }
        var pending = 0;
        var addresses = [];
        // RFC 4408 Section 10.1
        if (mxes.length > self.LIMIT) {
            return cb(null, self.SPF_PERMERROR);
        }
        for (var a=0; a<mxes.length; a++) {
            pending++;
            var mx = mxes[a].exchange;
            // Calculate which IP method to use
            var resolve_method;
            var cidr;
            if (self.ip_ver === 'ipv4') {
                cidr = cidr4;
                resolve_method = 'resolve4';
            }
            else if (self.ip_ver === 'ipv6') {
                cidr = cidr6;
                resolve_method = 'resolve6';
            }
            dns[resolve_method](mx, function (err, addrs) {
                pending--;
                if (err) {
                    switch (err.code) {
                        case 'ENOTFOUND':
                        case 'ENODATA':
                        case dns.NXDOMAIN:  break;
                        default:            return cb(null, self.SPF_TEMPERROR);
                    }
                }
                else {
                    self.log_debug('mech_mx: mx=' + mx + ' addresses=' + addrs.join(','));
                    addresses = addrs.concat(addresses);
                }
                if (pending === 0) {
                    if (!addresses.length) return cb(null, self.SPF_NONE);
                    // All queries run; see if our IP matches
                    if (cidr) {
                        // CIDR match type
                        for (var i=0; i<addresses.length; i++) {
                            var range = ipaddr.parse(addresses[i]);
                            if (self.ipaddr.match(range, cidr)) {
                                self.log_debug('mech_mx: ' + self.ip + ' => ' + addresses[i] + '/' + cidr + ': MATCH!');
                                return cb(null, self.return_const(qualifier));
                            }
                            else {
                                self.log_debug('mech_mx: ' + self.ip + ' => ' + addresses[i] + '/' + cidr + ': NO MATCH');
                            }
                        }
                        // No matches
                        return cb(null, self.SPF_NONE);
                    } 
                    else {
                        if (addresses.indexOf(self.ip) !== -1) {
                            self.log_debug('mech_mx: ' + self.ip + ' => ' + addresses.join(',') + ': MATCH!');
                            return cb(null, self.return_const(qualifier));
                        }
                        else {
                            self.log_debug('mech_mx: ' + self.ip + ' => ' + addresses.join(',') + ': NO MATCH');
                            return cb(null, self.SPF_NONE);
                        }
                    }
                }
            });
            // In case we didn't run any queries...
            if (pending === 0) {
                return cb(null, self.SPF_NONE);
            }
        }
        if (pending === 0) {
            return cb(null, self.SPF_NONE);
        }
    });
};

SPF.prototype.mech_ptr = function (qualifier, args, cb) {
    var self = this;
    this.count++;
    var dm, domain = this.domain;
    if (args && (dm = /^:([^\/ ]+)/.exec(args))) {
        domain = dm[1];
    }
    // First do a PTR lookup for the connecting IP
    dns.reverse(this.ip, function (err, ptrs) {
        if (err) {
            self.log_debug('mech_ptr: lookup=' + self.ip + ' => ' + err);
            return cb(null, self.SPF_NONE);
        }
        else {
            var resolve_method;
            if (self.ip_ver === 'ipv4') resolve_method = 'resolve4';
            if (self.ip_ver === 'ipv6') resolve_method = 'resolve6';
            var pending = 0;
            var names = [];
            // RFC 4408 Section 10.1
            if (ptrs.length > self.LIMIT) {
                return cb(null, self.SPF_PERMERROR);
            }
            for (var i=0; i<ptrs.length; i++) {
                var ptr = ptrs[i];
                pending++;
                dns[resolve_method](ptr, function (err, addrs) {
                    pending--;
                    if (err) {
                        // Skip on error
                        self.log_debug('mech_ptr: lookup=' + ptr + ' => ' + err);
                    }
                    else {
                        for (var a=0; a<addrs.length; a++) {
                            if (addrs[a] === self.ip) {
                                self.log_debug('mech_ptr: ' + self.ip + ' => ' + ptr + ' => ' + addrs[a] + ': MATCH!');
                                names.push(ptr.toLowerCase());
                            }
                            else {
                                self.log_debug('mech_ptr: ' + self.ip + ' => ' + ptr + ' => ' + addrs[a] + ': NO MATCH');
                            }
                        }
                    }
                    // Finished
                    if (pending === 0) {
                        var re;
                        // Catch bogus PTR matches e.g. ptr:*.bahnhof.se (should be ptr:bahnhof.se)
                        // These will cause a regexp error, so we can catch them.
                        try {
                            re = new RegExp(domain.replace('\.','\\.') + '$', 'i');
                        }
                        catch (e) {
                            self.log_debug('mech_ptr: domain="' + self.domain + '" err="' + e.message + '"');
                            return cb(null, self.SPF_PERMERROR);
                        } 
                        for (var t=0; t<names.length; t++) {
                            if (re.test(names[t])) {
                                self.log_debug('mech_ptr: ' + names[t] + ' => ' + domain + ': MATCH!');
                                return cb(null, self.return_const(qualifier));
                            }
                            else {
                                self.log_debug('mech_ptr: ' + names[t] + ' => ' + domain + ': NO MATCH');
                            }
                        }
                        return cb(null, self.SPF_NONE);
                    }
                });
            }
            if (pending === 0) {
                // No queries run
                return cb(null, self.SPF_NONE);
            }
        }
    });
};

SPF.prototype.mech_ip = function (qualifier, args, cb) {
    var cidr = args.substr(1);
    var match = /^([^\/ ]+)(?:\/(\d+))?$/.exec(cidr);
    if (!match) { return cb(null, this.SPF_NONE); }

    // match[1] == ip
    // match[2] == mask
    try {
        if (!match[2]) {
            // Default masks for each IP version
            if (this.ip_ver === 'ipv4') match[2] = '32';
            if (this.ip_ver === 'ipv6') match[2] = '128';
        }
        var range = ipaddr.parse(match[1]);
        var rtype = range.kind();
        if (this.ip_ver !== rtype) {
            this.log_debug('mech_ip: ' + this.ip + ' => ' + cidr + ': SKIP');
            return cb(null, this.SPF_NONE);
        }
        if (this.ipaddr.match(range, match[2])) {
            this.log_debug('mech_ip: ' + this.ip + ' => ' + cidr + ': MATCH!');
            return cb(null, this.return_const(qualifier));
        } 
        else {
            this.log_debug('mech_ip: ' + this.ip + ' => ' + cidr + ': NO MATCH');
        }
    }
    catch (e) {
        this.log_debug(e.message);
        return cb(null, this.SPF_PERMERROR);
    }
    return cb(null, this.SPF_NONE);
};

SPF.prototype.mech_ip4 = SPF.prototype.mech_ip;
SPF.prototype.mech_ip6 = SPF.prototype.mech_ip;

SPF.prototype.mod_redirect = function (domain, cb) {
    // Avoid circular references
    if (this.been_there[domain]) {
        this.log_debug('circular reference detected: ' + domain);
        return cb(null, this.SPF_NONE);
    } 
    this.count++;
    this.been_there[domain] = 1;
    return this.check_host(this.ip, domain, this.mail_from, cb);
};

SPF.prototype.mod_exp = function (str, cb) {
    // NOT IMPLEMENTED
    return cb(null, this.SPF_NONE);
};

exports.SPF = SPF;
