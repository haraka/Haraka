"use strict";
// a class encapsulating an email address as per RFC-2821

// Since we don't need logger in production, we comment it out so that
// our test don't have to stub out the Address object, but can instead
// use the real thing.  If debugging is needed in this module, simply
// add your logs and uncomment this require.  Just make sure to comment
// out again when everything is working.  If you don't tests will hang.
// var logger = require('./logger');

var qchar = /([^a-zA-Z0-9!#\$\%\&\x27\*\+\x2D\/=\?\^_`{\|}~.])/;

function Address (user, host) {
    if (typeof user == 'object' && user.original) {
        // Assume reconstructing from JSON parse
        for (var k in user) {
            this[k] = user[k];
        }
        return this;
    }
    var match = /^<(.*)>$/.exec(user);
    if (match) {
        this.original = user;
        this.parse(match[1]);
    }
    else if (!host) {
        this.original = user;
        this.parse(user);
    }
    else {
        this.original = user + '@' + host;
        this.user = user;
        this.host = host;
    }
}


exports.atom_expr = /[a-zA-Z0-9!#%&*+=?\^_`{|}~\$\x27\x2D\/]+/;
exports.address_literal_expr =
  /(?:\[(?:\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|IPv6:[0-9A-Fa-f:.]+)\])/;
exports.subdomain_expr = /(?:[a-zA-Z0-9](?:[_\-a-zA-Z0-9]*[a-zA-Z0-9])?)/;
exports.domain_expr = undefined; // so you can override this when loading and re-run compile_re()
exports.qtext_expr = /[\x01-\x08\x0B\x0C\x0E-\x1F\x21\x23-\x5B\x5D-\x7F]/;
exports.text_expr  = /\\([\x01-\x09\x0B\x0C\x0E-\x7F])/;

var domain_re, source_route_re, user_host_re, atoms_re, qt_re;

exports.compile_re = function () {
    domain_re = exports.domain_expr || new RegExp (
                                         exports.subdomain_expr.source +
                                         '(?:\\.' + exports.subdomain_expr.source + ')*'
                                         );
    
    if (!exports.domain_expr && exports.address_literal_expr) {
        // if address_literal_expr is set, add it in
        domain_re = new RegExp('(?:' + exports.address_literal_expr.source +
                               '|'   + domain_re.source + ')');
    }
    
    source_route_re = new RegExp('^@' + domain_re.source +
                                 '(?:,@' + domain_re.source + ')*:');
    
    user_host_re = new RegExp('^(.*)@(' + domain_re.source + ')$');
    
    atoms_re = new RegExp('^' + exports.atom_expr.source +
                          '(\\.' + exports.atom_expr.source + ')*');
    
    qt_re = new RegExp('^"((' + exports.qtext_expr.source +
                       '|' + exports.text_expr.source + ')*)"$');
}

exports.compile_re();

Address.prototype.parse = function (addr) {
    // strip source route
    addr = addr.replace(source_route_re, '');
    
    // empty addr is ok
    if (addr === '') {
        this.user = null;
        this.host = null;
        return;
    }

    // bare postmaster is permissible, perl RFC-2821 (4.5.1)
    if (addr.toLowerCase() === 'postmaster') {
        this.user = 'postmaster';
        this.host = null;
        return;
    }

    var matches;
    
    if (!(matches = user_host_re.exec(addr))) {
        throw new Error("Invalid domain in address: " + addr);
    }
    
    var localpart  = matches[1];
    var domainpart = matches[2];

    if (atoms_re.test(localpart)) {
        // simple case, we are done
        this.user = localpart;
        // I'm lower-case'ing here. Not sure if that's the "right" thing
        // to do, as the original case could be useful (but then you can get
        // that from address.original I guess).
        this.host = domainpart.toLowerCase();
        return;
    }
    else if (matches = qt_re.exec(localpart)) {
        localpart = matches[1];
        this.user = localpart.replace(exports.text_expr, '$1', 'g');
        this.host = domainpart.toLowerCase();
        return;
    }
    else {
        throw new Error("Invalid local part in address: " + addr);
    }
}

Address.prototype.isNull = function () {
    return this.user ? 0 : 1;
}

Address.prototype.format = function () {
    if (this.isNull()) {
        return '<>';
    }
    
    var user = this.user.replace(qchar, '\\$1', 'g');
    if (user !== this.user) {
        return '<"' + user + '"' + (this.host ? ('@' + this.host) : '') + '>';
    }
    return '<' + this.address() + '>';
}

Address.prototype.address = function (set) {
    if (set) {
        this.original = set;
        this.parse(set);
    }
    return (this.user || '') + (this.host ? ('@' + this.host) : '');
}

Address.prototype.toString = function () {
    return this.format();
}

exports.Address = Address;
