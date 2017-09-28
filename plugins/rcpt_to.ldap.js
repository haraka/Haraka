'use strict';

const util = require('util');

exports.register = function () {
    const plugin = this;
    plugin.inherits('rcpt_to.host_list_base');

    try {
        plugin.ldap = require('ldapjs');
    }
    catch (e) {
        plugin.logerror("failed to load ldapjs, " +
            " try installing it: npm install ldapjs");
        return;
    }

    // only load this stuff if ldapjs loaded
    plugin.load_host_list();
    plugin.load_ldap_ini();
    plugin.register_hook('rcpt', 'ldap_rcpt');
};

exports.load_ldap_ini = function () {
    const plugin = this;
    plugin.cfg = plugin.config.get('rcpt_to.ldap.ini', 'ini', function () {
        plugin.load_ldap_ini();
    });
};

exports.ldap_rcpt = function (next, connection, params) {
    const plugin = this;
    const txn = connection.transaction;
    if (!txn) return next();

    const rcpt = txn.rcpt_to[txn.rcpt_to.length - 1];
    if (!rcpt.host) {
        txn.results.add(plugin, {fail: '!domain'});
        return next();
    }
    const domain = rcpt.host.toLowerCase();

    if (!plugin.in_host_list(domain) && !plugin.in_ldap_ini(domain)) {
        connection.logdebug(plugin, "domain '" + domain + "' is not local; skip ldap");
        return next();
    }

    const ar = txn.results.get('access');
    if (ar && ar.pass.length > 0 && ar.pass.indexOf("rcpt_to.access.whitelist") !== -1) {
        connection.loginfo(plugin, "skip whitelisted recipient");
        return next();
    }

    txn.results.add(plugin, { msg: 'connecting' });

    const cfg = plugin.cfg[domain] || plugin.cfg.main;
    if (!cfg) {
        connection.logerror(plugin, 'no LDAP config for ' + domain);
        return next();
    }

    let client;
    try { client = plugin.ldap.createClient({ url: cfg.server }); }
    catch (e) {
        connection.logerror(plugin, 'connect error: ' + e);
        return next();
    }

    client.on('error', function (err) {
        connection.loginfo(plugin, 'client error ' + err.message);
        next(DENYSOFT, 'Backend failure. Please, retry later');
    });

    client.bind(cfg.binddn, cfg.bindpw, function (err) {
        connection.logerror(plugin, 'error: ' + err);
    });

    const opts = plugin.get_search_opts(cfg, rcpt);
    connection.logdebug(plugin, "Search filter is: " + util.inspect(opts));

    const search_result = function (err, res) {
        if (err) {
            connection.logerror(plugin, 'LDAP search error: ' + err);
            return next(DENYSOFT, 'Backend failure. Please, retry later');
        }
        const items = [];
        res.on('searchEntry', function (entry) {
            connection.logdebug(plugin, 'entry: ' + JSON.stringify(entry.object));
            items.push(entry.object);
        });

        res.on('error', function (err2) { // called for tcp (non-ldap) errors
            connection.logerror(plugin, 'LDAP search error: ' + err2);
            next(DENYSOFT, 'Backend failure. Please, retry later');
        });

        res.on('end', function (result) {
            connection.logdebug(plugin, 'LDAP search results: ' + items.length + ' -- ' + util.inspect(items));

            if (items.length) return next();

            next(DENY, "Sorry - no mailbox here by that name.");
        });
    };
    client.search(cfg.basedn, opts, search_result);
};

exports.get_search_opts = function (cfg, rcpt) {

    const plain_rcpt = rcpt.address().toLowerCase();
    // JSON.stringify(rcpt.original).replace(/</, '').replace(/>/, '').replace(/"/g, '');

    return {
        filter: '(&(objectClass=' + cfg.objectclass + ')(|(mail=' + plain_rcpt  + ')(mailAlternateAddress=' + plain_rcpt + ')))',
        scope: 'sub',
        attributes: ['dn', 'mail', 'mailAlternateAddress']
    };
};

exports.in_ldap_ini = function (domain) {
    const plugin = this;
    if (!domain) return false;
    if (!plugin.cfg) return false;
    if (!plugin.cfg[domain]) return false;
    if (!plugin.cfg[domain].server) return false;
    return true;
};
