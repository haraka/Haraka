// bounce tests
const tlds = require('haraka-tld');
const SPF  = require('haraka-plugin-spf').SPF;

const net_utils = require('haraka-net-utils');

exports.register = function () {
    this.load_bounce_ini();
    this.load_bounce_bad_rcpt();

    this.register_hook('mail',      'reject_all');
    this.register_hook('data',      'single_recipient');
    this.register_hook('data',      'bad_rcpt');
    this.register_hook('data_post', 'empty_return_path');
    this.register_hook('data',      'bounce_spf_enable');
    this.register_hook('data_post', 'bounce_spf');
    this.register_hook('data_post', 'non_local_msgid');
}

exports.load_bounce_bad_rcpt = function () {
    
    const new_list = this.config.get('bounce_bad_rcpt', 'list', () => {
        this.load_bounce_bad_rcpt();
    });

    const invalids = {};
    for (const element of new_list) {
        invalids[element] = true;
    }

    this.cfg.invalid_addrs = invalids;
}

exports.load_bounce_ini = function () {
    this.cfg = this.config.get('bounce.ini', {
        booleans: [
            '-check.reject_all',
            '+check.single_recipient',
            '-check.empty_return_path',
            '+check.bad_rcpt',
            '+check.bounce_spf',
            '+check.non_local_msgid',

            '+reject.single_recipient',
            '-reject.empty_return_path',
            '-reject.bounce_spf',
            '-reject.non_local_msgid',
        ],
    }, () => {
        this.load_bounce_ini();
    });

    // Legacy config handling
    if (this.cfg.main.reject_invalid) {
        this.logerror('bounce.ini is out of date, please update!');
        this.cfg.check.single_recipient=true;
        this.cfg.reject.single_recipient=true;
    }

    if (this.cfg.main.reject_all) {
        this.logerror('bounce.ini is out of date, please update!');
        this.cfg.check.reject_all=true;
    }
}

exports.reject_all = function (next, connection, params) {
    if (!this.cfg.check.reject_all) return next();

    const mail_from = params[0];
    // bounce messages are from null senders
    if (!this.has_null_sender(connection, mail_from)) return next();

    connection.transaction.results.add(this, {fail: 'bounces_accepted', emit: true });
    return next(DENY, 'No bounces accepted here');
}

exports.single_recipient = function (next, connection) {
    if (!this?.cfg?.check?.single_recipient) return next();
    if (!this?.has_null_sender(connection)) return next();
    const { transaction, relaying, remote } = connection;

    // Valid bounces have a single recipient
    if (transaction.rcpt_to.length === 1) {
        transaction.results.add(this, {pass: 'single_recipient', emit: true });
        return next();
    }

    // Skip this check for relays or private_ips
    // This is because Microsoft Exchange will send mail
    // to distribution groups using the null-sender if
    // the option 'Do not send delivery reports' is
    // checked (not sure if this is default or not)
    if (relaying) {
        transaction.results.add(this, {skip: 'single_recipient(relay)', emit: true });
        return next();
    }
    if (remote.is_private) {
        transaction.results.add(this, {skip: 'single_recipient(private_ip)', emit: true });
        return next();
    }

    connection.loginfo(this, `bounce with too many recipients to: ${transaction.rcpt_to.join(',')}`);

    transaction.results.add(this, {fail: 'single_recipient', emit: true });

    if (!this.cfg.reject.single_recipient) return next();

    return next(DENY, 'this bounce message does not have 1 recipient');
}

exports.empty_return_path = function (next, connection) {
    if (!this.cfg.check.empty_return_path) return next();
    if (!this.has_null_sender(connection)) return next();

    const transaction = connection.transaction;
    // Bounce messages generally do not have a Return-Path set. This checks
    // for that. But whether it should is worth questioning...

    // On Jan 20, 2014, Matt Simerson examined the most recent 50,000 mail
    // connections for the presence of Return-Path in bounce messages. I
    // found 14 hits, 12 of which were from Google, in response to
    // undeliverable DMARC reports (IE, automated messages that Google
    // shouldn't have replied to). Another appears to be a valid bounce from
    // a poorly configured mailer, and the 14th was a confirmed spam kill.
    // Unless new data demonstrate otherwise, this should remain disabled.

    // Return-Path, aka Reverse-PATH, Envelope FROM, RFC5321.MailFrom
    // validate that the Return-Path header is empty, RFC 3834

    const rp = transaction.header.get('Return-Path');
    if (!rp) {
        transaction.results.add(this, {pass: 'empty_return_path' });
        return next();
    }

    if (rp === '<>') {
        transaction.results.add(this, {pass: 'empty_return_path' });
        return next();
    }

    transaction.results.add(this, {fail: 'empty_return_path', emit: true });
    return next(DENY, 'bounce with non-empty Return-Path (RFC 3834)');
}

exports.bad_rcpt = function (next, connection) {
    if (!this.cfg.check.bad_rcpt) return next();
    if (!this.has_null_sender(connection)) return next();
    if (!this.cfg.invalid_addrs) return next();

    const transaction = connection.transaction;
    for (const element of transaction.rcpt_to) {
        const rcpt = element.address();
        if (!this.cfg.invalid_addrs[rcpt]) continue;
        transaction.results.add(this, {fail: 'bad_rcpt', emit: true });
        return next(DENY, 'That recipient does not accept bounces');
    }
    transaction.results.add(this, {pass: 'bad_rcpt'});

    return next();
}

exports.has_null_sender = function (connection, mail_from) {
    // ok ?
    const transaction = connection?.transaction;
    if (!transaction) return false;

    if (!mail_from) mail_from = transaction.mail_from;

    // bounces have a null sender.
    // null sender could also be tested with mail_from.user
    // Why would isNull() exist if it wasn't the right way to test this?
    if (mail_from.isNull()) {
        transaction.results.add(this, {isa: 'yes'});
        return true;
    }

    transaction.results.add(this, {isa: 'no'});
    return false;
}

const message_id_re = /^Message-ID:\s*(<?[^>]+>?)/mig;

function find_message_id_headers (headers, body, connection, self) {
    if (!body) return;

    let match;
    while ((match = message_id_re.exec(body.bodytext))) {
        const mid = match[1];
        headers[mid] = true;
    }

    for (let i=0,l=body.children.length; i < l; i++) {
        // Recure to any MIME children
        find_message_id_headers(headers, body.children[i], connection, self);
    }
}

exports.non_local_msgid = function (next, connection) {
    if (!this.cfg.check.non_local_msgid) return next();
    if (!this.has_null_sender(connection)) return next();

    const transaction = connection?.transaction;
    if (!transaction) return next();
    // Bounce messages usually contain the headers of the original message
    // in the body. This parses the body, searching for the Message-ID header.
    // It then inspects the contents of that header, extracting the domain part,
    // and then checks to see if that domain is local to this server.

    // NOTE: this only works reliably if *every* message sent has a local
    // domain in the Message-ID. In practice, that means outbound MXes MUST
    // check Message-ID on outbound and modify non-conforming Message-IDs.
    //
    // NOTE 2: Searching the bodytext of a bounce is too simple. The bounce
    // message should exist as a MIME Encoded part. See here for ideas
    //     http://lamsonproject.org/blog/2009-07-09.html
    //     http://lamsonproject.org/docs/bounce_detection.html

    let matches = {}
    find_message_id_headers(matches, transaction.body, connection, this);
    matches = Object.keys(matches);
    connection.logdebug(this, `found Message-IDs: ${matches.join(', ')}`);

    if (!matches.length) {
        connection.loginfo(this, 'no Message-ID matches');
        transaction.results.add(this, { fail: 'Message-ID' });
        if (!this.cfg.reject.non_local_msgid) return next();
        return next(DENY, `bounce without Message-ID in headers, unable to verify that I sent it`);
    }

    const domains=[];
    for (const match of matches) {
        const res = match.match(/@([^>]*)>?/i);
        if (!res) continue;
        domains.push(res[1]);
    }

    if (domains.length === 0) {
        connection.loginfo(this, 'no domain(s) parsed from Message-ID headers');
        transaction.results.add(this, { fail: 'Message-ID parseable' });
        if (!this.cfg.reject.non_local_msgid) return next();
        return next(DENY, `bounce with invalid Message-ID, I didn't send it.`);
    }

    connection.logdebug(this, domains);

    const valid_domains=[];
    for (const domain of domains) {
        const org_dom = tlds.get_organizational_domain(domain);
        if (!org_dom) { continue; }
        valid_domains.push(org_dom);
    }

    if (valid_domains.length === 0) {
        transaction.results.add(this, { fail: 'Message-ID valid domain' });
        if (!this.cfg.reject.non_local_msgid) return next();
        return next(DENY, `bounce Message-ID without valid domain, I didn't send it.`);
    }

    return next();

    /* The code below needs some kind of test to say the domain isn't local.
        this would be hard to do without knowing how you have Haraka configured.
        e.g. it could be config/host_list, or it could be some other way.
        - hence I added the return next() above or this test can never be correct.
    */
    // we wouldn't have accepted the bounce if the recipient wasn't local
    // transaction.results.add(plugin,
    //         {fail: 'Message-ID not local', emit: true });
    // if (!plugin.cfg.reject.non_local_msgid) return next();
    // return next(DENY, "bounce with non-local Message-ID (RFC 3834)");
}

// Lazy regexp to get IPs from Received: headers in bounces
const received_re = net_utils.get_ipany_re('^Received:[\\s\\S]*?[\\[\\(](?:IPv6:)?', '[\\]\\)]');

function find_received_headers (ips, body, connection, self) {
    if (!body) return;
    let match;
    while ((match = received_re.exec(body.bodytext))) {
        const ip = match[1];
        if (net_utils.is_private_ip(ip)) continue;
        ips[ip] = true;
    }
    for (let i=0,l=body.children.length; i < l; i++) {
        // Recurse in any MIME children
        find_received_headers(ips, body.children[i], connection, self);
    }
}

exports.bounce_spf_enable = function (next, connection) {
    if (!connection.transaction) return next();
    if (this.cfg.check.bounce_spf) {
        connection.transaction.parse_body = true;
    }
    return next();
}

exports.bounce_spf = function (next, connection) {
    if (!this.cfg.check.bounce_spf) return next();
    if (!this.has_null_sender(connection)) return next();

    const txn = connection?.transaction;
    if (!txn) return next();

    // Recurse through all textual parts and store all parsed IPs
    // in an object to remove any duplicates which might appear.
    let ips = {};
    find_received_headers(ips, txn.body, connection, this);
    ips = Object.keys(ips);
    if (!ips.length) {
        connection.loginfo(this, 'No received headers found in message');
        return next();
    }

    connection.logdebug(this, `found IPs to check: ${ips.join(', ')}`);

    let pending = 0;
    let aborted = false;
    let called_cb = false;
    let timer;

    function run_cb (abort, retval, msg) {
        if (aborted) return;
        if (abort) aborted = true;
        if (!aborted && pending > 0) return;
        if (called_cb) return;
        clearTimeout(timer);
        called_cb = true;
        return next(retval, msg);
    }

    timer = setTimeout(() => {
        connection.logerror(this, 'Timed out');
        txn.results.add(this, { skip: 'bounce_spf(timeout)' });
        return run_cb(true);
    }, (this.timeout - 1) * 1000);

    ips.forEach(ip => {
        if (aborted) return;
        const spf = new SPF();
        pending++;
        spf.check_host(ip, txn.rcpt_to[0].host, txn.rcpt_to[0].address(),
            (err, result) => {
                if (aborted) return;
                pending--;
                if (err) {
                    connection.logerror(this, err.message);
                    return run_cb();
                }
                connection.logdebug(this, `ip=${ip} spf_result=${spf.result(result)}`);
                switch (result) {
                    case (spf.SPF_NONE):
                        // falls through, domain doesn't publish an SPF record
                    case (spf.SPF_TEMPERROR):
                    case (spf.SPF_PERMERROR):
                        // Abort as all subsequent lookups will return this
                        connection.logdebug(this, `Aborted: SPF returned ${spf.result(result)}`);
                        txn.results.add(this, { skip: 'bounce_spf' });
                        return run_cb(true);
                    case (spf.SPF_PASS):
                        // Presume this is a valid bounce
                        // TODO: this could be spoofed; could weight each IP to combat
                        connection.loginfo(this, `Valid bounce originated from ${ip}`);
                        txn.results.add(this, { pass: 'bounce_spf' });
                        return run_cb(true);
                }
                if (pending === 0 && !aborted) {
                    // We've checked all the IPs and none of them returned Pass
                    txn.results.add(this, {fail: 'bounce_spf', emit: true });
                    if (!this.cfg.reject.bounce_spf) return run_cb();
                    return run_cb(false, DENY, 'Invalid bounce (spoofed sender)');
                }
            }
        );
        if (pending === 0 && !aborted) {
            // No lookups run for some reason
            return run_cb();
        }
    });
}

