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
    plugin.host_list = plugin.config.get('host_list', 'list', plugin.load_host_list);
};

exports.validate_rcpt = function(next, connection, params) {
    var plugin = this;

    var domain = params[0].host.toLowerCase();
    if (plugin.host_list.indexOf(domain) == -1) {
        connection.loginfo(plugin, "Recipient domain is not local; skipping ldap check.");
        return next();
    }

    var ar = connection.transaction.results.get('access');
    if (ar && ar.pass.length >= 1) {
        if (ar.pass.indexOf("rcpt_to.access.whitelist") !== -1) {
            connection.loginfo(plugin, "Accepting whitelisted recipient.");
            return next();
        }
    }

    var client = plugin.ldap.createClient({
        url: plugin.cfg.main.server
    });

    client.bind(plugin.cfg.main.binddn, plugin.cfg.main.bindpw, function(err) {
        connection.logerror(plugin, 'error: ' + err);
    });

    var rcpt = params[0];
    var plain_rcpt = JSON.stringify(rcpt.original).replace('<', '').replace('>', '').replace('"', '').replace('"', '');

    var opts = {
        filter: '(&(objectClass=' + plugin.cfg.main.objectclass + ')(|(mail=' + plain_rcpt  + ')(mailAlternateAddress=' + plain_rcpt + ')))',
        scope: 'sub',
        attributes: ['dn', 'mail', 'mailAlternateAddress']
    };

    connection.logdebug(plugin, "Search filter is: " + util.inspect(opts));

    client.search(plugin.cfg.main.basedn, opts, function(err, res) {
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

            if (!items.length) {
                return next(DENY, "Sorry - no mailbox here by that name.");
            } else {
                next();
            }
        });
    });
};
