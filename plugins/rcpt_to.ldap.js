'use strict';

var util = require('util');

exports.register = function() {
    var plugin = this;
    plugin.inherits('host_list_base');

    try {
        plugin.ldap = require('ldapjs');
    }
    catch(e) {
        plugin.logerror("failed to load ldapjs, try installing it (npm install ldapjs)");
        return;
    }

    // only load this stuff if ldapjs loaded
    plugin.load_host_list();
    plugin.load_ldap_ini();
    plugin.register_hook('rcpt', 'ldap_rcpt');
};

exports.load_ldap_ini = function() {
    var plugin = this;
    plugin.loginfo("loading rcpt_to.ldap.ini");
    plugin.cfg = plugin.config.get('rcpt_to.ldap.ini', 'ini', plugin.load_ldap_ini);
};

exports.ldap_rcpt = function(next, connection, params) {
    var plugin = this;
    var txn = connection.transaction;
    if (!txn) return next();

    var rcpt = params[0];
    if (!rcpt.host) {
        txn.results.add(plugin, {fail: '!domain'});
        return next();
    }
    var domain = rcpt.host.toLowerCase();

    if (!plugin.in_host_list(domain) && !plugin.in_ldap_ini(domain)) {
        connection.logdebug(plugin, "domain '" + domain + "' is not local; skip ldap");
        return next();
    }

    var ar = txn.results.get('access');
    if (ar && ar.pass.length > 0 && ar.pass.indexOf("rcpt_to.access.whitelist") !== -1) {
        connection.loginfo(plugin, "skip whitelisted recipient");
        return next();
    }

    txn.results.add(plugin, { msg: 'connecting' });

    var cfg = plugin.in_host_list(domain) ? plugin.cfg.main : plugin.cfg[domain];
    if (!cfg) {
        connection.logerror(plugin, 'no LDAP config for ' + domain);
        return next();
    }

    var client;
    try { client = plugin.ldap.createClient({ url: cfg.server }); }
    catch (e) {
        connection.logerror(plugin, 'connect error: ' + e);
        return next();
    }

    client.bind(cfg.binddn, cfg.bindpw, function(err) {
        connection.logerror(plugin, 'error: ' + err);
    });

    var opts = plugin.get_search_opts(cfg, rcpt);
    connection.logdebug(plugin, "Search filter is: " + util.inspect(opts));

    var search_result = function(err, res) {
        if (err) {
            connection.logerror(plugin, 'LDAP search error: ' + err);
        }
        var items = [];
        res.on('searchEntry', function(entry) {
            connection.logdebug(plugin, 'entry: ' + JSON.stringify(entry.object));
            items.push(entry.object);
        });

        res.on('error', function(err) {
            connection.logerror(plugin, 'LDAP search error: ' + err);
        });

        res.on('end', function(result) {
            connection.logdebug(plugin, 'LDAP search results: ' + items.length + ' -- ' + util.inspect(items));

            if (items.length) return next();

            next(DENY, "Sorry - no mailbox here by that name.");
        });
    };
    client.search(cfg.basedn, opts, search_result);
};

exports.get_search_opts = function (cfg, rcpt) {

    var plain_rcpt = rcpt.address().toLowerCase();
    // JSON.stringify(rcpt.original).replace(/</, '').replace(/>/, '').replace(/"/g, '');

    return {
        filter: '(&(objectClass=' + cfg.objectclass + ')(|(mail=' + plain_rcpt  + ')(mailAlternateAddress=' + plain_rcpt + ')))',
        scope: 'sub',
        attributes: ['dn', 'mail', 'mailAlternateAddress']
    };
};

exports.in_ldap_ini = function (domain) {
    var plugin = this;
    if (!domain) return false;
    if (!plugin.cfg) return false;
    if (!plugin.cfg[domain]) return false;
    if (!plugin.cfg[domain].server) return false;
    return true;
};
