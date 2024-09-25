//queue/lmtp

'use strict';

let outbound;

exports.register = function () {
    this.load_lmtp_ini();
    outbound = this.haraka_require('outbound');
}

exports.load_lmtp_ini = function () {
    this.cfg = this.config.get('lmtp.ini', () => {
        this.load_lmtp_ini();
    })
}

exports.hook_get_mx = function (next, hmail, domain) {

    if (!hmail.todo.notes.using_lmtp) return next();

    const section = this.cfg[domain] || this.cfg.main;

    const mx = {
        using_lmtp: true,
        priority: 0,
        exchange: section.host ?? '127.0.0.1',
        port: section.port ?? 24,
    };

    if (section.path) mx.path = section.path;

    next(OK, mx);
}

exports.hook_queue = (next, connection) => {
    const txn = connection?.transaction;
    if (!txn) return next();

    const q_wants = txn.notes.get('queue.wants');

    if (q_wants && q_wants !== 'lmtp') return next();

    txn.notes.using_lmtp = true;
    outbound.send_trans_email(txn, next);
}
