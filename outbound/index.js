'use strict';

const fs          = require('node:fs');
const path        = require('node:path');

const { Address } = require('address-rfc2821');
const config      = require('haraka-config');
const constants   = require('haraka-constants');
const net_utils   = require('haraka-net-utils');
const utils       = require('haraka-utils');
const ResultStore = require('haraka-results');

const logger      = require('../logger');
const trans       = require('../transaction');
const plugins     = require('../plugins');
const FsyncWriteStream = require('./fsync_writestream');

const obc         = require('./config');
const queuelib    = require('./queue');
const HMailItem   = require('./hmail');
const TODOItem    = require('./todo');
const _qfile = exports.qfile = require('./qfile');

const { queue_dir, temp_fail_queue, delivery_queue } = queuelib;

const smtp_ini = config.get('smtp.ini', { booleans: [ '+headers.add_received' ] })

exports.temp_fail_queue = temp_fail_queue;
exports.delivery_queue = delivery_queue;

exports.name = 'outbound';
exports.net_utils = net_utils;
exports.config = config;

const qlfns = ['get_stats', 'list_queue', 'stat_queue', 'scan_queue_pids', 'flush_queue',
    'load_pid_queue', 'ensure_queue_dir', 'load_queue', 'stats'
]
for (const n of qlfns) {
    exports[n] = queuelib[n];
}

process.on('message', msg => {
    if (!msg.event) return

    if (msg.event === 'outbound.load_pid_queue') {
        exports.load_pid_queue(msg.data);
        return;
    }
    if (msg.event === 'outbound.flush_queue') {
        exports.flush_queue(msg.domain, process.pid);
        return;
    }
    if (msg.event === 'outbound.shutdown') {
        logger.info(exports, "Shutting down temp fail queue");
        temp_fail_queue.shutdown();
        return;
    }
    // ignores the message
});

exports.send_email = function (from, to, contents, next, options = {}) {

    const dot_stuffed = options.dot_stuffed ?? false;
    const notes = options.notes ?? null;
    const origin = options.origin ?? exports;

    logger.info("Sending email via params", origin);

    const transaction = trans.createTransaction(null, smtp_ini);

    logger.info(`Created transaction: ${transaction.uuid}`, origin);

    // Adding notes passed as parameter
    if (notes) transaction.notes = notes;

    // set MAIL FROM address, and parse if it's not an Address object
    if (from instanceof Address) {
        transaction.mail_from = from;
    }
    else {
        try {
            from = new Address(from);
        }
        catch (err) {
            return next(constants.deny, `Malformed from: ${err}`);
        }
        transaction.mail_from = from;
    }

    // Make sure to is an array
    if (!(Array.isArray(to))) to = [ to ];

    if (to.length === 0) {
        return next(constants.deny, "No recipients for email");
    }

    // Set RCPT TO's, and parse each if it's not an Address object.
    for (let i=0,l=to.length; i < l; i++) {
        if (!(to[i] instanceof Address)) {
            try {
                to[i] = new Address(to[i]);
            }
            catch (err) {
                return next(constants.deny,
                    `Malformed to address (${to[i]}): ${err}`);
            }
        }
    }

    transaction.rcpt_to = to;

    // Set data_lines to lines in contents
    if (typeof contents == 'string') {
        let match;
        while ((match = utils.line_regexp.exec(contents))) {
            let line = match[1];
            line = line.replace(/\r?\n?$/, '\r\n'); // make sure it ends in \r\n
            if (dot_stuffed === false && line.length >= 3 && line.substr(0,1) === '.') {
                line = `.${line}`;
            }
            transaction.add_data(Buffer.from(line));
            contents = contents.substr(match[1].length);
            if (contents.length === 0) {
                break;
            }
        }
    }
    else {
        // Assume a stream
        return stream_line_reader(contents, transaction, err => {
            if (err) {
                return next(constants.denysoft, `Error from stream line reader: ${err}`);
            }
            exports.send_trans_email(transaction, next);
        });
    }

    transaction.message_stream.add_line_end();

    // Allow for the removal of Message-Id and/or Date headers which
    // is useful when resending mail from a quarantine.
    if (options.remove_msgid) {
        transaction.remove_header('Message-Id');
    }
    if (options.remove_date) {
        transaction.remove_header('Date');
    }

    this.send_trans_email(transaction, next);
}

function stream_line_reader (stream, transaction, cb) {
    let current_data = '';
    function process_data (data) {
        current_data += data.toString();
        let results;
        while ((results = utils.line_regexp.exec(current_data))) {
            const this_line = results[1];
            current_data = current_data.slice(this_line.length);
            if (!(current_data.length || this_line.length)) {
                return;
            }
            transaction.add_data(Buffer.from(this_line));
        }
    }

    function process_end () {
        if (current_data.length) {
            transaction.add_data(Buffer.from(current_data));
        }
        current_data = '';
        transaction.message_stream.add_line_end();
        cb();
    }

    stream.on('data', process_data);
    stream.once('end', process_end);
    stream.once('error', cb);
}

function get_deliveries (transaction) {
    const deliveries = [];

    if (obc.cfg.always_split) {
        logger.debug(exports, "always split");
        for (const rcpt of transaction.rcpt_to) {
            deliveries.push({domain: rcpt.host, rcpts: [ rcpt ]});
        }
        return deliveries;
    }

    // First get each domain
    const recips = {};
    transaction.rcpt_to.forEach(rcpt => {
        const domain = rcpt.host;
        if (!recips[domain]) { recips[domain] = []; }
        recips[domain].push(rcpt);
    });
    Object.keys(recips).forEach(domain => {
        deliveries.push({domain, 'rcpts': recips[domain]});
    });
    return deliveries;
}

exports.send_trans_email = function (transaction, next) {

    // add potentially missing headers
    if (!transaction.header.get_all('Message-Id').length) {
        logger.info(exports, "Adding missing Message-Id header");
        transaction.add_header('Message-Id', `<${transaction.uuid}@${net_utils.get_primary_host_name()}>`);
    }
    if (transaction.header.get('Message-Id') === '<>') {
        logger.info(exports, "Replacing empty Message-Id header");
        transaction.remove_header('Message-Id');
        transaction.add_header('Message-Id', `<${transaction.uuid}@${net_utils.get_primary_host_name()}>`);
    }
    if (!transaction.header.get_all('Date').length) {
        logger.info(exports, "Adding missing Date header");
        transaction.add_header('Date', utils.date_to_str(new Date()));
    }

    if (obc.cfg.received_header !== 'disabled') {
        transaction.add_leading_header('Received', `(${obc.cfg.received_header}); ${utils.date_to_str(new Date())}`);
    }

    const connection = { transaction };

    logger.add_log_methods(connection);
    if (!transaction.results) {
        logger.debug(exports, 'adding results store');
        transaction.results = new ResultStore(connection);
    }

    connection.pre_send_trans_email_respond = async (retval) => {
        const deliveries = get_deliveries(transaction);
        const hmails = [];
        const ok_paths = [];

        let todo_index = 1;

        try {
            for (const deliv of deliveries) {
                const todo = new TODOItem(deliv.domain, deliv.rcpts, transaction);
                todo.uuid = `${todo.uuid}.${todo_index}`;
                todo_index++;
                await this.process_delivery(ok_paths, todo, hmails);
            }
        }
        catch (err) {
            for (let i=0, l=ok_paths.length; i<l; i++) {
                fs.unlink(ok_paths[i], () => {});
            }
            transaction.results.add({ name: 'outbound'}, { err });
            if (next) next(constants.denysoft, err);
            return;
        }

        for (const hmail of hmails) {
            delivery_queue.push(hmail);
        }

        transaction.results.add({ name: 'outbound'}, { pass: "queued" });
        if (next) next(constants.ok, `Message Queued (${transaction.uuid})`);
    }

    plugins.run_hooks('pre_send_trans_email', connection);
}

exports.process_delivery = function (ok_paths, todo, hmails) {
    return new Promise((resolve, reject) => {

        logger.info(exports, `Transaction delivery for domain: ${todo.domain}`);
        const fname = _qfile.name();
        const tmp_path = path.join(queue_dir, `${_qfile.platformDOT}${fname}`);
        const ws = new FsyncWriteStream(tmp_path, { flags: constants.WRITE_EXCL });

        ws.on('close', () => {
            const dest_path = path.join(queue_dir, fname);
            fs.rename(tmp_path, dest_path, err => {
                if (err) {
                    logger.error(exports, `Unable to rename tmp file!: ${err}`);
                    fs.unlink(tmp_path, () => {});
                    reject("Queue error");
                }
                else {
                    hmails.push(new HMailItem (fname, dest_path, todo.notes));
                    ok_paths.push(dest_path);
                    resolve();
                }
            })
        })

        ws.on('error', err => {
            logger.error(exports, `Unable to write queue file (${fname}): ${err}`);
            ws.destroy();
            fs.unlink(tmp_path, () => {});
            reject("Queueing failed");
        })

        this.build_todo(todo, ws, () => {
            todo.message_stream.pipe(ws, { dot_stuffing: true });
        });
    })
}

exports.build_todo = (todo, ws, write_more) => {

    const todo_str = `\n${JSON.stringify(todo, exclude_from_json, '\t')}\n`
    const todo_len = Buffer.byteLength(todo_str)

    const buf = Buffer.alloc(4 + todo_len);
    buf.writeUInt32BE(todo_len, 0);
    buf.write(todo_str, 4);

    const continue_writing = ws.write(buf);
    if (continue_writing) {
        process.nextTick(write_more);
        return
    }

    ws.once('drain', write_more);
}

// Replacer function to exclude items from the queue file header
function exclude_from_json (key, value) {
    switch (key) {
        case 'message_stream':
            return undefined;
        default:
            return value;
    }
}

// exported for testability
exports.TODOItem = TODOItem;

exports.HMailItem = HMailItem;
