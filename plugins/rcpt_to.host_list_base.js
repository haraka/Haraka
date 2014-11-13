'use strict';
// Base class for plugins that use config/host_list

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

exports.load_host_list_regex = function () {
    var plugin = this;
    plugin.loginfo(plugin, "loading host_list_regex");
    plugin.host_list_regex = plugin.config.get('host_list_regex', 'list', plugin.load_host_list_regex);
    plugin.hl_re = new RegExp ('^(?:' + plugin.host_list_regex.join('|') + ')$', 'i');
};

exports.hook_mail = function(next, connection, params) {
    var plugin = this;
    var txn = connection.transaction;
    if (!txn) { return; }

    var email = params[0].address();
    if (!email) {
        txn.results.add(plugin, {skip: 'mail_from.null', emit: true});
        return next();
    }

    var domain = params[0].host.toLowerCase();

    if (plugin.in_host_list(domain)) {
        txn.results.add(plugin, {pass: 'mail_from'});
        txn.notes.local_sender = true;
        return next();
    }

    if (plugin.in_host_regex(domain)) {
        txn.results.add(plugin, {pass: 'mail_from'});
        txn.notes.local_sender = true;
        return next();
    }

    txn.results.add(plugin, {msg: 'mail_from!local'});
    return next();
};

exports.in_host_list = function (domain) {
    var plugin = this;
    plugin.logdebug("checking " + domain + " in config/host_list");
    if (plugin.host_list[domain]) {
        return true;
    }
    return false;
};

exports.in_host_regex = function (domain) {
    var plugin = this;
    if (!plugin.host_list_regex) return false;
    if (!plugin.host_list_regex.length) return false;

    plugin.logdebug("checking " + domain + " against config/host_list_regex ");

    if (plugin.hl_re.test(domain)) { return true; }
    return false;
};
