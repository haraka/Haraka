"use strict";
/* jshint node: true */
/* globals DENY */

var util = require('util');

exports.register = function() {
    var plugin = this;

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
    plugin.register_hook('rcpt', 'validate_rcpt');
};

exports.load_ldap_ini = function() {
    var plugin = this;
    plugin.loginfo("loading rcpt_to.ldap.ini");
    plugin.cfg = plugin.config.get('rcpt_to.ldap.ini', 'ini', plugin.load_ldap_ini);
};

exports.load_host_list = function () {
    var plugin = this;

    plugin.loginfo(plugin, "loading host_list");
    var lowered_list = {};  // assemble
    var raw_list = plugin.config.get('host_list', 'list', plugin.load_host_list);
    for (var i in raw_list) {
        lowered_list[raw_list[i].toLowerCase()] = true;
    }
    plugin.host_list = lowered_list;
};

exports.validate_rcpt = function(next, connection, params) {
    var plugin = this;

    var rcpt = params[0];
    if (!rcpt.host) {
        connection.transaction.results.add(plugin, {fail: '!domain'});
        return next();
    }
    var domain = rcpt.host.toLowerCase();

    if (!plugin.in_host_list(domain) && !plugin.in_ldap_ini(domain)) {
        connection.logdebug(plugin, "domain '" + domain + "' is not local; skip ldap");
        return next();
    }

    var ar = connection.transaction.results.get('access');
    if (ar && ar.pass.length > 0 && ar.pass.indexOf("rcpt_to.access.whitelist") !== -1) {
        connection.loginfo(plugin, "skip whitelisted recipient");
        return next();
    }

    var cfg = plugin.in_host_list(domain) ? plugin.cfg.main : plugin.cfg[domain];
    var client = plugin.ldap.createClient({ url: cfg.server });

    client.bind(cfg.binddn, cfg.bindpw, function(err) {
        connection.logerror(plugin, 'error: ' + err);
    });

    var plain_rcpt = rcpt.address().toLowerCase();
    // JSON.stringify(rcpt.original).replace(/</, '').replace(/>/, '').replace(/"/g, '');

    var opts = {
        filter: '(&(objectClass=' + cfg.objectclass + ')(|(mail=' + plain_rcpt  + ')(mailAlternateAddress=' + plain_rcpt + ')))',
        scope: 'sub',
        attributes: ['dn', 'mail', 'mailAlternateAddress']
    };

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

exports.in_host_list = function (domain) {
    var plugin = this;
    plugin.logdebug("checking " + domain + " in config/host_list");
    if (plugin.host_list[domain]) return true;
    return false;
};

exports.in_ldap_ini = function (domain) {
    var plugin = this;
    if (!plugin.cfg[domain]) return false;
    if (!plugin.cfg[domain].server) return false;
    return true;
};
