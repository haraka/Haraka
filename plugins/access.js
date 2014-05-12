// access plugin
var net_utils = require('./net_utils');

exports.register = function() {
    var plugin = this;

    plugin.init_config();
    plugin.init_lists();

    var phase;
    for (phase in plugin.cfg.white)    plugin.load_file('white', phase);
    for (phase in plugin.cfg.black)    plugin.load_file('black', phase);
    for (phase in plugin.cfg.re.white) plugin.load_re_file('white', phase);
    for (phase in plugin.cfg.re.black) plugin.load_re_file('black', phase);

    if (plugin.cfg.check.conn) {
        plugin.register_hook('connect', 'rdns_access');
    }
    if (plugin.cfg.check.helo) {
        plugin.register_hook('helo',    'helo_access');
        plugin.register_hook('ehlo',    'helo_access');
    }
    if (plugin.cfg.check.mail) plugin.register_hook('mail', 'mail_from_access');
    if (plugin.cfg.check.rcpt) plugin.register_hook('rcpt', 'rcpt_to_access');

    if (plugin.cfg.check.any) {
        plugin.load_domain_file('domain', 'any');
        ['connect','helo','ehlo','mail','rcpt'].forEach(function (hook) {
            plugin.register_hook(hook, 'any');
        });
    }
};

exports.init_config = function() {
    var plugin = this;

    plugin.cfg = {
        deny_msg: {
            conn: 'You are not allowed to connect',
            helo: 'That HELO is not allowed to connect',
            mail: 'That sender cannot send mail here',
            rcpt: 'That recipient is not allowed',
        },
        domain: {
            any:  'access.domains',
        },
        white: {
            conn: 'connect.rdns_access.whitelist',
            mail: 'mail_from.access.whitelist',
            rcpt: 'rcpt_to.access.whitelist',
        },
        black: {
            conn: 'connect.rdns_access.blacklist',
            mail: 'mail_from.access.blacklist',
            rcpt: 'rcpt_to.access.blacklist',
        },
        re: {
            black: {
                conn: 'connect.rdns_access.blacklist_regex',
                mail: 'mail_from.access.blacklist_regex',
                rcpt: 'rcpt_to.access.blacklist_regex',
                helo: 'helo.checks.regexps',
            },
            white: {
                conn: 'connect.rdns_access.whitelist_regex',
                mail: 'mail_from.access.whitelist_regex',
                rcpt: 'rcpt_to.access.whitelist_regex',
            },
        },
    };

    var cfg = plugin.config.get('access.ini', {
        booleans: [
            '+check.any',
            '+check.conn',
            '-check.helo',
            '+check.mail',
            '+check.rcpt',
        ],
    });

    plugin.cfg.check = cfg.check;
    if (cfg.deny_msg) {
        for (var p in plugin.cfg.deny_msg) {
            if (cfg.deny_msg[p]) plugin.cfg.deny_msg[p] = cfg.deny_msg[p];
        }
    }

    // backwards compatibility
    var mf_cfg = plugin.config.get('mail_from.access.ini');
    if (mf_cfg && mf_cfg.general && mf_cfg.general.deny_msg) {
        plugin.cfg.deny_msg.mail = mf_cfg.general.deny_msg;
    }
    var rcpt_cfg = plugin.config.get('rcpt_to.access.ini');
    if (rcpt_cfg && rcpt_cfg.general && rcpt_cfg.general.deny_msg) {
        plugin.cfg.deny_msg.rcpt = rcpt_cfg.general.deny_msg;
    }
    var rdns_cfg = this.config.get('connect.rdns_access.ini');
    if (rdns_cfg && rdns_cfg.general && rdns_cfg.general.deny_msg) {
        plugin.cfg.deny_msg.conn = rdns_cfg.general.deny_msg;
    }
};

exports.init_lists = function () {
    var plugin = this;
    plugin.list = {
        black: { conn: [], helo: [], mail: [], rcpt: [] },
        white: { conn: [], helo: [], mail: [], rcpt: [] },
        domain: { any: [] },
    };
    plugin.list_re = {
        black: {},
        white: {},
    };
};

exports.any = function (next, connection, params) {
    var plugin = this;
    if (!plugin.cfg.check.any) return next();

    // step 1: get a domain name from whatever info is available
    var domain;
    var email;
    try {
        if (params === undefined) {              // connect
            var h = connection.remote_host;
            if (!h) return next();
            if (h === 'DNSERROR' || h === 'Unknown') return next();
            domain = h;
        }
        else if (typeof params === 'string') {   // HELO/EHLO
            domain = params;
            if (net_utils.is_ipv4_literal(domain)) { return next(); }
        }
        else if (Array.isArray(params)) {        // MAIL FROM / RCPT TO
            email = params[0].address();
            domain = params[0].host;
        }
    }
    catch (e) {
        connection.logerror(plugin, "oops: " + e);
        return next();
    }
    if (!domain) {
        connection.logerror(plugin, "no domain!");
        return next();
    }
    var org_domain = net_utils.get_organizational_domain(domain);
    if (!org_domain) {
        connection.logerror(plugin, "no org domain from domain " + domain);
        return next();
    }

    // step 2: check for whitelist
    var file = plugin.cfg.domain.any;
    if (plugin.in_list('domain', 'any', '!'+org_domain)) {
        connection.results.add(plugin, {pass: file, whitelist: true, emit: true});
        return next();
    }
    if (email) {
        if (plugin.in_list('domain', 'any', '!'+email)) {
            connection.results.add(plugin, {pass: file, whitelist: true, emit: true});
            return next();
        }
    }
    else {
        if (plugin.in_list('domain', 'any', '!'+domain)) {
            connection.results.add(plugin, {pass: file, whitelist: true, emit: true});
            return next();
        }
    }

    // step 3: check for blacklist
    file = plugin.cfg.domain.any;
    if (plugin.in_list('domain', 'any', org_domain)) {
        connection.results.add(plugin, {fail: file+'('+org_domain+')', blacklist: true, emit: true});
        return next(DENY, "You are not welcome here.");
    }

    connection.results.add(plugin, {pass: 'any', emit: true});
    return next();
};

exports.rdns_access = function(next, connection) {
    var plugin = this;
    if (!plugin.cfg.check.conn) return next();

    // TODO: can this really happen?
    if (!connection.remote_ip) {
        connection.results.add(plugin, {err: 'no IP??', emit: true});
        return next();
    }

    var r_ip = connection.remote_ip;
    var host = connection.remote_host;

    var addrs = [ r_ip, host ];
    for (var i=0; i<addrs.length; i++) {
        var addr = addrs[i];
        if (!addr) continue;  // empty rDNS host
        if (/[\w]/.test(addr)) addr = addr.toLowerCase();

        var file = plugin.cfg.white.conn;
        connection.logdebug(plugin, 'checking ' + addr + ' against ' + file);
        if (plugin.in_list('white', 'conn', addr)) {
            connection.results.add(plugin, {pass: file, whitelist: true, emit: true});
            return next();
        }

        file = plugin.cfg.re.white.conn;
        connection.logdebug(plugin, 'checking ' + addr + ' against ' + file);
        if (plugin.in_re_list('white', 'conn', addr)) {
            connection.results.add(plugin, {pass: file, whitelist: true, emit: true});
            return next();
        }
    }

    // blacklist checks
    for (var i=0; i < addrs.length; i++) {
        var addr = addrs[i];
        if (!addr) continue;  // empty rDNS host
        if (/[\w]/.test(addr)) addr = addr.toLowerCase();

        var file = plugin.cfg.black.conn;
        if (plugin.in_list('black', 'conn', addr)) {
            connection.results.add(plugin, {fail: file, emit: true});
            return next(DENYDISCONNECT, host + ' [' + r_ip + '] ' + plugin.cfg.deny_msg.conn);
        }

        file = plugin.cfg.re.black.conn;
        connection.logdebug(plugin, 'checking ' + addr + ' against ' + file);
        if (plugin.in_re_list('black', 'conn', addr)) {
            connection.results.add(plugin, {fail: file, emit: true});
            return next(DENYDISCONNECT, host + ' [' + r_ip + '] ' + plugin.cfg.deny_msg.conn);
        }
    }

    connection.results.add(plugin, {pass: 'unlisted(conn)', emit: true});
    return next();
};

exports.helo_access = function(next, connection, helo) {
    var plugin = this;
    if (!plugin.cfg.check.helo) return next();

    var file = plugin.cfg.re.black.helo;
    if (plugin.in_re_list('black', 'helo', helo)) {
        connection.results.add(plugin, {fail: file, emit: true});
        return next(DENY, helo + ' ' + plugin.cfg.deny_msg.helo);
    }

    connection.results.add(plugin, {pass: 'unlisted(helo)', emit: true});
    return next();
};

exports.mail_from_access = function(next, connection, params) {
    var plugin = this;
    if (!plugin.cfg.check.mail) return next();

    var mail_from = params[0].address();
    if (!mail_from) {
        connection.transaction.results.add(plugin, {skip: 'null sender', emit: true});
        return next();
    }

    // address whitelist checks
    var file = plugin.cfg.white.mail;
    connection.logdebug(plugin, 'checking ' + mail_from + ' against ' + file);
    if (plugin.in_list('white', 'mail', mail_from)) {
        connection.transaction.results.add(plugin, {pass: file, emit: true});
        return next();
    }

    file = plugin.cfg.re.white.mail;
    connection.logdebug(plugin, 'checking ' + mail_from + ' against ' + file);
    if (plugin.in_re_list('white', 'mail', mail_from)) {
        connection.transaction.results.add(plugin, {pass: file, emit: true});
        return next();
    }

    // address blacklist checks
    file = plugin.cfg.black.mail;
    if (plugin.in_list('black', 'mail', mail_from)) {
        connection.transaction.results.add(plugin, {fail: file, emit: true});
        return next(DENY, mail_from + ' ' + plugin.cfg.deny_msg.mail);
    }

    file = plugin.cfg.re.black.mail;
    connection.logdebug(plugin, 'checking ' + mail_from + ' against ' + file);
    if (plugin.in_re_list('black', 'mail', mail_from)) {
        connection.transaction.results.add(plugin, {fail: file, emit: true});
        return next(DENY, mail_from + ' ' + plugin.cfg.deny_msg.mail);
    }

    connection.transaction.results.add(plugin, {pass: 'unlisted(mail)', emit: true});
    return next();
};

exports.rcpt_to_access = function(next, connection, params) {
    var plugin = this;
    if (!plugin.cfg.check.rcpt) return next();

    var rcpt_to = params[0].address();

    // address whitelist checks
    if (!rcpt_to) {
        connection.transaction.results.add(plugin, {skip: 'null rcpt', emit: true});
        return next();
    }

    var file = plugin.cfg.white.rcpt;
    if (plugin.in_list('white', 'rcpt', rcpt_to)) {
        connection.transaction.results.add(plugin, {pass: file, emit: true});
        return next();
    }

    file = plugin.cfg.re.white.rcpt;
    if (plugin.in_re_list('white', 'rcpt', rcpt_to)) {
        connection.transaction.results.add(plugin, {pass: file, emit: true});
        return next();
    }

    // address blacklist checks
    file = plugin.cfg.black.rcpt;
    if (plugin.in_list('black', 'rcpt', rcpt_to)) {
        connection.transaction.results.add(plugin, {fail: file, emit: true});
        return next(DENY, rcpt_to + ' ' + plugin.cfg.deny_msg.rcpt);
    }

    file = plugin.cfg.re.black.rcpt;
    if (plugin.in_re_list('black', 'rcpt', rcpt_to)) {
        connection.transaction.results.add(plugin, {fail: file, emit: true});
        return next(DENY, rcpt_to + ' ' + plugin.cfg.deny_msg.rcpt);
    }

    connection.transaction.results.add(plugin, {pass: 'unlisted(rcpt)', emit: true});
    return next();
};

exports.valid_regexes = function (list, file) {
    var valid = [];
    for (var i=0; i<list.length; i++) {
        try {
            new RegExp(list[i]);
        }
        catch (e) {
            this.logerror(this, "invalid regex in " + file + ", " + list[i]);
            continue;
        }
        valid.push(list[i]);
    }
    return valid;
};

exports.in_list = function (type, phase, address) {
    var plugin = this;
    if (!plugin.list[type][phase]) return false;
    return (plugin.list[type][phase].indexOf(address) === -1) ? false : true;
};

exports.in_re_list = function (type, phase, address) {
    var plugin = this;
    if (!plugin.list_re[type][phase]) return false;
    plugin.logdebug(plugin, 'checking ' + address + ' against ' + plugin.cfg.re[type][phase].source);
    return plugin.list_re[type][phase].test(address);
};

exports.in_file = function (file_name, address, connection) {
    var plugin = this;
    connection.logdebug(plugin, 'checking ' + address + ' against ' + file_name);
    return (plugin.config.get(file_name, 'list').indexOf(address) === -1) ? false : true;
};

exports.in_re_file = function (file_name, address) {
    // Since the helo.checks plugin uses this method, I tested to see how
    // badly if affected performance. It took 8.5x longer to run than
    // in_re_list.
    this.logdebug(this, 'checking ' + address + ' against ' + file_name);
    var re_list = this.valid_regexes(this.config.get(file_name, 'list'), file_name);
    for (var i=0; i<re_list.length; i++) {
        if (new RegExp('^' + re_list[i] + '$', 'i').test(address)) return true;
    }
    return false;
};

exports.load_file = function (type, phase) {
    var plugin = this;
    if (!plugin.cfg.check[phase]) {
        plugin.loginfo(plugin, "skipping " + plugin.cfg[type][phase]);
        return;
    }
    function load_em_high () {
        var file_name = plugin.cfg[type][phase];
        plugin.loginfo(plugin, "loading " + file_name);

        // load config with a self-referential callback
        var list = plugin.config.get(file_name, 'list', function () {
            load_em_high();
        });

        // convert list items to LC at load, so we don't have to a run time
        for (var i=0; i<list.length; i++) {
            if (list[i] !== list[i].toLowerCase()) list[i] = list[i].toLowerCase();
        }

        // init the list store, type is white or black
        if (!plugin.list) plugin.list = {};
        if (!plugin.list[type]) plugin.list[type] = {};

        plugin.list[type][phase] = list;
    }
    load_em_high();
};

exports.load_re_file = function (type, phase) {
    var plugin = this;
    if (!plugin.cfg.check[phase]) {
        plugin.loginfo(plugin, "skipping " + plugin.cfg.re[type][phase]);
        return;
    }
    function load_re () {
        var file_name = plugin.cfg.re[type][phase];
        plugin.loginfo(plugin, "loading " + file_name);

        var regex_list = plugin.valid_regexes(
                plugin.config.get(file_name, 'list', function () {
                    load_re(); }));

        // initialize the list store
        if (!plugin.list_re) plugin.list_re = {};
        if (!plugin.list_re[type]) plugin.list_re[type] = {};

        // compile the regexes at the designated location
        plugin.list_re[type][phase] = new RegExp('^(' + regex_list.join('|') + ')$', 'i');
    }
    load_re();
};

exports.load_domain_file = function (type, phase) {
    var plugin = this;
    if (!plugin.cfg.check[phase]) {
        plugin.loginfo(plugin, "skipping " + plugin.cfg[type][phase]);
        return;
    }
    function load_domains () {
        var file_name = plugin.cfg[type][phase];
        plugin.loginfo(plugin, "loading " + file_name);

        var list = plugin.config.get(file_name, 'list', function() {
            load_domains();
        });

        // init the list store, if needed
        if (!plugin.list) plugin.list = {};
        if (!plugin.list[type]) plugin.list[type] = {};

        // convert list items to LC at load, so we don't have to at run time
        for (var i=0; i<list.length; i++) {
            if (list[i][0] === '!') {  // whitelist entry
                plugin.list[type][phase].push(list[i].toLowerCase());
                continue;
            }

            var d = net_utils.get_organizational_domain(list[i]);
            if (!d) continue;
            plugin.list[type][phase].push(d.toLowerCase());
        }
    }
    load_domains();
};
