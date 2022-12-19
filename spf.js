'use strict';
// spf

const dns = require('dns');
const ipaddr = require('ipaddr.js');
const net_utils = require('haraka-net-utils')

class SPF {
    constructor (count, been_there) {
        // For macro expansion
        // This should be set before check_host() is called
        this.helo = 'unknown';
        this.spf_record = '';

        // RFC 4408 Section 10.1
        // Limit the number of mechanisms/modifiers that require DNS lookups to complete.
        this.count = 0;

        // If we have recursed we are supplied the count
        if (count) this.count = count;

        // Prevent circular references, this isn't covered in the RFC
        this.been_there = {};
        if (been_there) this.been_there = been_there;

        // RFC 4408 Section 10.1
        this.LIMIT = 10;

        // Constants
        this.SPF_NONE = 1;
        this.SPF_PASS = 2;
        this.SPF_FAIL = 3;
        this.SPF_SOFTFAIL = 4;
        this.SPF_NEUTRAL = 5;
        this.SPF_TEMPERROR = 6;
        this.SPF_PERMERROR = 7;

        this.mech_ip4 = this.mech_ip;
        this.mech_ip6 = this.mech_ip;
    }

    const_translate (value) {
        const t = {};
        for (const k in this) {
            if (typeof this[k] === 'number') {
                t[this[k]] = k.toUpperCase();
            }
        }
        if (t[value]) return t[value];
        return 'UNKNOWN';
    }

    result (value) {
        switch (value) {
            case this.SPF_NONE:      return 'None';
            case this.SPF_PASS:      return 'Pass';
            case this.SPF_FAIL:      return 'Fail';
            case this.SPF_SOFTFAIL:  return 'SoftFail';
            case this.SPF_NEUTRAL:   return 'Neutral';
            case this.SPF_TEMPERROR: return 'TempError';
            case this.SPF_PERMERROR: return 'PermError';
            default:                 return `Unknown (${value})`;
        }
    }

    return_const (qualifier) {
        switch (qualifier) {
            case '+':   return this.SPF_PASS;
            case '-':   return this.SPF_FAIL;
            case '~':   return this.SPF_SOFTFAIL;
            case '?':   return this.SPF_NEUTRAL;
            default:    return this.SPF_PERMERROR;
        }
    }

    expand_macros (str) {
        const macro = /%{([slodipvh])((?:(?:\d+)?r?)?)?([-.+,/_=])?}/ig;
        let match;
        while ((match = macro.exec(str))) {
            // match[1] = macro-letter
            // match[2] = transformers
            // match[3] = delimiter
            if (!match[3]) match[3] = '.';
            let strip = /(\d+)/.exec(match[2]);
            if (strip) strip = strip[1];

            // FIXME: why does replacing the template literal cause an error?
            const reverse = (((`${match[2]}`).indexOf('r')) !== -1);
            let replace;
            let kind;
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
        return str.replace(/%-/g, '%20');
    }

    log_debug (str) {
        console.error(str);
    }

    valid_ip (ip) {
        const ip_split = /^:([^/ ]+)(?:\/([^ ]+))?$/.exec(ip);
        if (!ip_split) {
            this.log_debug(`invalid IP address: ${ip}`);
            return false;
        }
        if (!ipaddr.isValid(ip_split[1])) {
            this.log_debug(`invalid IP address: ${ip_split[1]}`);
            return false;
        }
        return true;
    }

    check_host (ip, domain, mail_from, cb) {
        const self = this;
        domain = domain.toLowerCase();
        mail_from = mail_from ? mail_from.toLowerCase() : `postmaster@${domain}`;
        this.ipaddr = ipaddr.parse(ip);
        this.ip_ver = this.ipaddr.kind();
        this.ip = this.ip_ver === 'ipv6' ? this.ipaddr.toString() : ip;
        this.domain = domain;
        this.mail_from = mail_from;

        this.log_debug(`ip=${ip} domain=${domain} mail_from=${mail_from}`);

        // Get the SPF record for domain
        dns.resolveTxt(domain, (err, txt_rrs) => {
            if (err) {
                self.log_debug(`error looking up TXT record: ${err.message}`);
                switch (err.code) {
                    case dns.NOTFOUND:
                    case dns.NODATA:
                    case dns.NXDOMAIN:  return cb(null, self.SPF_NONE);
                    default:            return cb(null, self.SPF_TEMPERROR);
                }
            }

            let spf_record;
            let match;
            for (let txt_rr of txt_rrs) {
                // Node 0.11.x compatibility
                // FIXME: remove when 0.11.x is no longer supported
                if (Array.isArray(txt_rr)) txt_rr = txt_rr.join('');

                match = /^(v=spf1(?:$|\s.+$))/i.exec(txt_rr);
                if (!match) {
                    self.log_debug(`discarding TXT record: ${txt_rr}`);
                    continue;
                }

                if (spf_record) {
                    // already found an MX record
                    self.log_debug(`found additional SPF record for domain ${domain}: ${match[1]}`);
                    return cb(null, self.SPF_PERMERROR);
                }
                self.log_debug(`found SPF record for domain ${domain}: ${match[1]}`);
                spf_record = match[1].replace(/\s+/, ' ').toLowerCase();
            }

            if (!spf_record) return cb(null, self.SPF_NONE);   // No SPF record?

            // Store the SPF record used in the object
            self.spf_record = spf_record;

            // Validate SPF record and build call chain
            const mech_array = [];
            const mod_array = [];
            const mech_regexp1 = /^([-+~?])?(all|a|mx|ptr)$/;
            const mech_regexp2 = /^([-+~?])?(a|mx|ptr|ip4|ip6|include|exists)((?::[^/ ]+(?:\/\d+(?:\/\/\d+)?)?)|\/\d+(?:\/\/\d+)?)$/;
            const mod_regexp = /^([^ =]+)=([a-z0-9:/._-]+)$/;
            const split = spf_record.split(' ');
            for (let i=1; i<split.length; i++) {
                // Skip blanks
                let obj;
                if (!split[i]) continue;
                // FIXME: is this a comparison or assignment?
                if ((match = (mech_regexp1.exec(split[i]) || mech_regexp2.exec(split[i])))) {
                    // match[1] = qualifier
                    // match[2] = mechanism
                    // match[3] = optional args
                    if (!match[1]) match[1] = '+';
                    self.log_debug(`found mechanism: ${match}`);

                    if (match[2] === 'ip4' || match[2] === 'ip6') {
                        if (!this.valid_ip(match[3])) return cb(null, self.SPF_PERMERROR);
                    }
                    else {
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
                // FIXME: is this a comparison or assignment?
                else if ((match = mod_regexp.exec(split[i]))) {
                    self.log_debug(`found modifier: ${match}`);
                    // match[1] = modifier
                    // match[2] = name
                    // Make sure we have a method
                    if (self[`mod_${match[1]}`]) {
                        obj = {};
                        obj[match[1]] = match[2];
                        mod_array.push(obj);
                    }
                    else {
                        self.log_debug(`skipping unknown modifier: ${match[1]}`);
                    }
                }
                else {
                    // Syntax error
                    self.log_debug(`syntax error: ${split[i]}`);
                    return cb(null, self.SPF_PERMERROR);
                }
            }

            self.log_debug(`SPF record for '${self.domain}' validated OK`);

            // Set-up modifier run chain
            function mod_chain_caller (err2, result) {
                // Throw any errors
                if (err2) throw err2;
                // Check limits
                if (self.count > self.LIMIT) {
                    self.log_debug('lookup limit reached');
                    return cb(null, self.SPF_PERMERROR);
                }
                // Return any result that is not SPF_NONE
                if (result && result !== self.SPF_NONE) {
                    return cb(err2, result);
                }
                if (!mod_array.length) {
                    return cb(null, self.SPF_NEUTRAL);
                }
                const next_in_chain = mod_array.shift();
                const func = Object.keys(next_in_chain);
                const args = next_in_chain[func];
                self.log_debug(`running modifier: ${func} args=${args} domain=${self.domain}`);
                self[`mod_${func}`](args, mod_chain_caller);
            }

            // Run all the mechanisms first
            function mech_chain_caller (err3, result) {
                // Throw any errors
                if (err3) throw err3;
                // Check limits
                if (self.count > self.LIMIT) {
                    self.log_debug('lookup limit reached');
                    return cb(null, self.SPF_PERMERROR);
                }
                // If we have a result other than SPF_NONE
                if (result && result !== self.SPF_NONE) {
                    return cb(err3, result);
                }
                // Return default if no more mechanisms to run
                if (!mech_array.length) {
                    // Now run any modifiers
                    return mod_array.length ? mod_chain_caller() : cb(null, self.SPF_NEUTRAL);
                }
                const next_in_chain = mech_array.shift();
                const func = Object.keys(next_in_chain);
                const args = next_in_chain[func];
                self.log_debug(`running mechanism: ${func} args=${args} domain=${self.domain}`);
                self[`mech_${func}`](((args?.length) ? args[0] : null), ((args?.length) ? args[1] : null), mech_chain_caller);
            }
            // Start the chain
            mech_chain_caller();
        });
    }

    mech_all (qualifier, args, cb) {
        return cb(null, this.return_const(qualifier));
    }

    mech_include (qualifier, args, cb) {
        const domain = args.substr(1);
        // Avoid circular references
        if (this.been_there[domain]) {
            this.log_debug(`circular reference detected: ${domain}`);
            return cb(null, this.SPF_NONE);
        }
        this.count++;
        this.been_there[domain] = true;
        // Recurse
        const recurse = new SPF(this.count, this.been_there);
        recurse.check_host(this.ip, domain, this.mail_from, (err, result) => {
            if (!err) {
                this.log_debug(`mech_include: domain=${domain} returned=${this.const_translate(result)}`);
                switch (result) {
                    case this.SPF_PASS:         return cb(null, this.SPF_PASS);
                    case this.SPF_FAIL:
                    case this.SPF_SOFTFAIL:
                    case this.SPF_NEUTRAL:      return cb(null, this.SPF_NONE);
                    case this.SPF_TEMPERROR:    return cb(null, this.SPF_TEMPERROR);
                    default:                    return cb(null, this.SPF_PERMERROR);
                }
            }
        });
    }

    mech_exists (qualifier, args, cb) {
        this.count++;
        const exists = args.substr(1);
        dns.resolve(exists, (err, addrs) => {
            if (err) {
                this.log_debug(`mech_exists: ${err}`);
                switch (err.code) {
                    case dns.NOTFOUND:
                    case dns.NODATA:
                    case dns.NXDOMAIN:
                        return cb(null, this.SPF_NONE);
                    default:
                        return cb(null, this.SPF_TEMPERROR);
                }
            }
            this.log_debug(`mech_exists: ${exists} result=${addrs.join(',')}`);
            return cb(null, this.return_const(qualifier));
        });
    }

    mech_a (qualifier, args, cb) {
        this.count++;
        // Parse any arguments
        let cm;
        let cidr4;
        let cidr6;
        if (args && (cm = /\/(\d+)(?:\/\/(\d+))?$/.exec(args))) {
            cidr4 = cm[1];
            cidr6 = cm[2];
        }
        let dm;
        let { domain } = this;
        if (args && (dm = /^:([^/ ]+)/.exec(args))) {
            domain = dm[1];
        }
        // Calculate with IP method to use
        let resolve_method;
        let cidr;
        if (this.ip_ver === 'ipv4') {
            cidr = cidr4;
            resolve_method = 'resolve4';
        }
        else if (this.ip_ver === 'ipv6') {
            cidr = cidr6;
            resolve_method = 'resolve6';
        }
        // Use current domain
        dns[resolve_method](domain, (err, addrs) => {
            if (err) {
                this.log_debug(`mech_a: ${err}`);
                switch (err.code) {
                    case dns.NOTFOUND:
                    case dns.NODATA:
                    case dns.NXDOMAIN:  return cb(null, this.SPF_NONE);
                    default:            return cb(null, this.SPF_TEMPERROR);
                }
            }
            for (const resolvedAddr of addrs) {
                if (cidr) {
                    // CIDR
                    const range = ipaddr.parse(resolvedAddr);
                    if (this.ipaddr.match(range, cidr)) {
                        this.log_debug(`mech_a: ${this.ip} => ${resolvedAddr}/${cidr}: MATCH!`);
                        return cb(null, this.return_const(qualifier));
                    }
                    this.log_debug(`mech_a: ${this.ip} => ${resolvedAddr}/${cidr}: NO MATCH`);
                }
                else if (resolvedAddr === this.ip) {
                    return cb(null, this.return_const(qualifier));
                }
                else {
                    this.log_debug(`mech_a: ${this.ip} => ${resolvedAddr}: NO MATCH`);
                }
            }
            return cb(null, this.SPF_NONE);
        });
    }

    mech_mx (qualifier, args, cb) {
        this.count++;
        // Parse any arguments
        let cm;
        let cidr4;
        let cidr6;
        if (args && (cm = /\/(\d+)((?:\/\/(\d+))?)$/.exec(args))) {
            cidr4 = cm[1];
            cidr6 = cm[2];
        }
        let dm;
        const domain = args && (dm = /^:([^/ ]+)/.exec(args)) ? dm[1] : this.domain;
        // Fetch the MX records for the specified domain
        net_utils.get_mx(domain, (err, mxes) => {
            if (err) {
                switch (err.code) {
                    case dns.NOTFOUND:
                    case dns.NODATA:
                    case dns.NXDOMAIN:  return cb(null, this.SPF_NONE);
                    default:            return cb(null, this.SPF_TEMPERROR);
                }
            }
            let pending = 0;
            let addresses = [];
            // RFC 4408 Section 10.1
            if (mxes.length > this.LIMIT) {
                return cb(null, this.SPF_PERMERROR);
            }
            for (const element of mxes) {
                pending++;
                const mx = element.exchange;
                // Calculate which IP method to use
                let resolve_method;
                let cidr;
                if (this.ip_ver === 'ipv4') {
                    cidr = cidr4;
                    resolve_method = 'resolve4';
                }
                else if (this.ip_ver === 'ipv6') {
                    cidr = cidr6;
                    resolve_method = 'resolve6';
                }
                dns[resolve_method](mx, (err4, addrs) => {
                    pending--;
                    if (err4) {
                        switch (err4.code) {
                            case dns.NOTFOUND:
                            case dns.NODATA:
                            case dns.NXDOMAIN:  break;
                            default:            return cb(null, this.SPF_TEMPERROR);
                        }
                    }
                    else {
                        this.log_debug(`mech_mx: mx=${mx} addresses=${addrs.join(',')}`);
                        addresses = addrs.concat(addresses);
                    }
                    if (pending === 0) {
                        if (!addresses.length) return cb(null, this.SPF_NONE);
                        // All queries run; see if our IP matches
                        if (cidr) {
                            // CIDR match type
                            for (const address_cidr of addresses) {
                                const range = ipaddr.parse(address_cidr);
                                if (this.ipaddr.match(range, cidr)) {
                                    this.log_debug(`mech_mx: ${this.ip} => ${address_cidr}/${cidr}: MATCH!`);
                                    return cb(null, this.return_const(qualifier));
                                }
                                this.log_debug(`mech_mx: ${this.ip} => ${address_cidr}/${cidr}: NO MATCH`);
                            }
                            // No matches
                            return cb(null, this.SPF_NONE);
                        }
                        else if (addresses.includes(this.ip)) {
                            this.log_debug(`mech_mx: ${this.ip} => ${addresses.join(',')}: MATCH!`);
                            return cb(null, this.return_const(qualifier));
                        }
                        else {
                            this.log_debug(`mech_mx: ${this.ip} => ${addresses.join(',')}: NO MATCH`);
                            return cb(null, this.SPF_NONE);
                        }
                    }
                });
                // In case we didn't run any queries...
                if (pending === 0) {
                    return cb(null, this.SPF_NONE);
                }
            }
            if (pending === 0) {
                return cb(null, this.SPF_NONE);
            }
        });
    }

    mech_ptr (qualifier, args, cb) {
        this.count++;
        let dm;
        let { domain } = this;
        if (args && (dm = /^:([^/ ]+)/.exec(args))) {
            domain = dm[1];
        }
        // First do a PTR lookup for the connecting IP
        dns.reverse(this.ip, (err, ptrs) => {
            if (err) {
                this.log_debug(`mech_ptr: lookup=${this.ip} => ${err}`);
                return cb(null, this.SPF_NONE);
            }
            let resolve_method;
            if (this.ip_ver === 'ipv4') resolve_method = 'resolve4';
            if (this.ip_ver === 'ipv6') resolve_method = 'resolve6';
            let pending = 0;
            const names = [];
            // RFC 4408 Section 10.1
            if (ptrs.length > this.LIMIT) {
                return cb(null, this.SPF_PERMERROR);
            }
            for (const ptr of ptrs) {
                pending++;
                dns[resolve_method](ptr, (err3, addrs) => {
                    pending--;
                    if (err3) {
                        // Skip on error
                        this.log_debug(`mech_ptr: lookup=${ptr} => ${err3}`);
                    }
                    else {
                        for (const addr_ptr of addrs) {
                            if (addr_ptr === this.ip) {
                                this.log_debug(`mech_ptr: ${this.ip} => ${ptr} => ${addr_ptr}: MATCH!`);
                                names.push(ptr.toLowerCase());
                            }
                            else {
                                this.log_debug(`mech_ptr: ${this.ip} => ${ptr} => ${addr_ptr}: NO MATCH`);
                            }
                        }
                    }
                    // Finished
                    if (pending !== 0) {
                        return;
                    }
                    let re;
                    // Catch bogus PTR matches e.g. ptr:*.bahnhof.se (should be ptr:bahnhof.se)
                    // These will cause a regexp error, so we can catch them.
                    try {
                        re = new RegExp(`${domain.replace('.','\\.')}$`, 'i');
                    }
                    catch (e) {
                        this.log_debug(
                            'mech_ptr',
                            {
                                domain: this.domain,
                                err: e.message
                            }
                        );
                        return cb(null, this.SPF_PERMERROR);
                    }
                    for (const name_ptr of names) {
                        if (re.test(name_ptr)) {
                            this.log_debug(`mech_ptr: ${name_ptr} => ${domain}: MATCH!`);
                            return cb(null, this.return_const(qualifier));
                        }
                        this.log_debug(`mech_ptr: ${name_ptr} => ${domain}: NO MATCH`);
                    }
                    return cb(null, this.SPF_NONE);
                });
            }
            if (pending === 0) {
                // No queries run
                return cb(null, this.SPF_NONE);
            }
        });
    }

    mech_ip (qualifier, args, cb) {
        const cidr = args.substr(1);
        const match = /^([^/ ]+)(?:\/(\d+))?$/.exec(cidr);
        if (!match) { return cb(null, this.SPF_NONE); }

        // match[1] == ip
        // match[2] == mask
        try {
            if (!match[2]) {
                // Default masks for each IP version
                if (this.ip_ver === 'ipv4') match[2] = '32';
                if (this.ip_ver === 'ipv6') match[2] = '128';
            }
            const range = ipaddr.parse(match[1]);
            const rtype = range.kind();
            if (this.ip_ver !== rtype) {
                this.log_debug(`mech_ip: ${this.ip} => ${cidr}: SKIP`);
                return cb(null, this.SPF_NONE);
            }
            if (this.ipaddr.match(range, match[2])) {
                this.log_debug(`mech_ip: ${this.ip} => ${cidr}: MATCH!`);
                return cb(null, this.return_const(qualifier));
            }
            this.log_debug(`mech_ip: ${this.ip} => ${cidr}: NO MATCH`);
        }
        catch (e) {
            this.log_debug(e.message);
            return cb(null, this.SPF_PERMERROR);
        }
        return cb(null, this.SPF_NONE);
    }

    mod_redirect (domain, cb) {
        // Avoid circular references
        if (this.been_there[domain]) {
            this.log_debug(`circular reference detected: ${domain}`);
            return cb(null, this.SPF_NONE);
        }
        this.count++;
        this.been_there[domain] = 1;
        return this.check_host(this.ip, domain, this.mail_from, cb);
    }

    mod_exp (str, cb) {
        // NOT IMPLEMENTED
        return cb(null, this.SPF_NONE);
    }
}

exports.SPF = SPF;