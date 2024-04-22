'use strict';
// Base class for plugins that use config/host_list

exports.load_host_list = function () {

    const lowered_list = {};  // assemble
    const raw_list = this.config.get('host_list', 'list', () => {
        this.load_host_list();
    });

    for (const i in raw_list) {
        lowered_list[raw_list[i].toLowerCase()] = true;
    }

    this.host_list = lowered_list;
}

exports.load_host_list_regex = function () {

    this.host_list_regex = this.config.get(
        'host_list_regex',
        'list',
        () => { this.load_host_list_regex(); }
    );

    this.hl_re = new RegExp (`^(?:${this.host_list_regex.join('|')})$`, 'i');
}

exports.hook_mail = function (next, connection, params) {
    const txn = connection?.transaction;
    if (!txn) return;

    const email = params[0].address();
    if (!email) {
        txn.results.add(this, {skip: 'mail_from.null', emit: true});
        return next();
    }

    const domain = params[0].host.toLowerCase();

    const anti_spoof = this.config.get('host_list.anti_spoof') || false;

    if (this.in_host_list(domain, connection) || this.in_host_regex(domain, connection)) {
        if (anti_spoof && !connection.relaying) {
            txn.results.add(this, {fail: 'mail_from.anti_spoof'});
            return next(DENY, `Mail from domain '${domain}' is not allowed from your host`);
        }
        txn.results.add(this, {pass: 'mail_from'});
        txn.notes.local_sender = true;
        return next();
    }

    txn.results.add(this, {msg: 'mail_from!local'});
    return next();
}

exports.in_host_list = function (domain, connection) {
    this.logdebug(connection, `checking ${domain} in config/host_list`);
    return !!(this.host_list[domain]);
}

exports.in_host_regex = function (domain, connection) {
    if (!this.host_list_regex) return false;
    if (!this.host_list_regex.length) return false;

    this.logdebug(connection, `checking ${domain} against config/host_list_regex `);

    return !!(this.hl_re.test(domain));
}
