'use strict';
// Check RCPT TO domain is in config/host_list

// Previous versions of this plugin (Haraka <= 2.4.0) did not account for
// relaying users. This plugin now permits relaying clients to send if
// the message is destined to or originating from a local domain.
//
// The mail hook always checks the MAIL FROM address and when detected, sets
// connection.transaction.notes.local_sender=true. During RCPT TO, if relaying
// is enabled and the sending domain is local, the receipt is OK.

exports.register = function () {
    this.inherits('rcpt_to.host_list_base');

    this.load_host_list();
    this.load_host_list_regex();
}

exports.hook_rcpt = function (next, connection, params) {
    const txn = connection?.transaction;
    if (!txn) return;

    const rcpt = params[0];

    // Check for RCPT TO without an @ first - ignore those here
    if (!rcpt.host) {
        txn.results.add(this, {fail: 'rcpt!domain'});
        return next();
    }

    connection.logdebug(this, `Checking if ${rcpt} host is in host_list`);

    const domain = rcpt.host.toLowerCase();

    if (this.in_host_list(domain, connection)) {
        txn.results.add(this, {pass: 'rcpt_to'});
        return next(OK);
    }

    if (this.in_host_regex(domain, connection)) {
        txn.results.add(this, {pass: 'rcpt_to'});
        return next(OK);
    }

    // in this case, a client with relaying privileges is sending FROM a local
    // domain. For them, any RCPT address is accepted.
    if (connection.relaying && txn.notes.local_sender) {
        txn.results.add(this, {pass: 'relaying local_sender'});
        return next(OK);
    }

    // the MAIL FROM domain is not local and neither is the RCPT TO
    // Another RCPT plugin may yet vouch for this recipient.
    txn.results.add(this, {msg: 'rcpt!local'});
    return next();
}
