// quarantine

const fs   = require('node:fs');
const path = require('node:path');

exports.register = function () {

    this.load_quarantine_ini();

    this.register_hook('queue',          'quarantine');
    this.register_hook('queue_outbound', 'quarantine');
}

exports.hook_init_master = function (next, server) {
    this.init_quarantine_dir(() => {
        this.clean_tmp_directory(next);
    });
}

exports.load_quarantine_ini = function () {
    this.cfg = this.config.get('quarantine.ini', () => {
        this.load_quarantine_ini();
    })
}

const zeroPad = exports.zeroPad = (n, digits) => {
    n = n.toString();
    while (n.length < digits) {
        n = `0${n}`;
    }
    return n;
}

exports.clean_tmp_directory = function (next) {
    const tmp_dir = path.join(this.get_base_dir(), 'tmp');

    if (fs.existsSync(tmp_dir)) {
        const dirent = fs.readdirSync(tmp_dir);
        this.loginfo(`Removing temporary files from: ${tmp_dir}`);
        for (const element of dirent) {
            fs.unlinkSync(path.join(tmp_dir, element));
        }
    }
    next();
}

function wants_quarantine (connection) {
    const { notes, transaction } = connection ?? {}

    if (notes.quarantine) return notes.quarantine;

    if (transaction.notes.quarantine) return transaction.notes.quarantine;

    return transaction.notes.get('queue.wants') === 'quarantine';
}

exports.get_base_dir = function () {
    if (this.cfg.main.quarantine_path) return this.cfg.main.quarantine_path;
    return '/var/spool/haraka/quarantine';
}

exports.init_quarantine_dir = function (done) {
    const tmp_dir = path.join(this.get_base_dir(), 'tmp');
    fs.promises.mkdir(tmp_dir, { recursive: true })
        .then(made => this.loginfo(`created ${tmp_dir}`))
        .catch(err => this.logerror(`Unable to create ${tmp_dir}`))
        .finally(done);
}

exports.quarantine = function (next, connection) {

    const quarantine = wants_quarantine(connection);
    this.logdebug(`quarantine: ${quarantine}`);
    if (!quarantine) return next();

    // Calculate date in YYYYMMDD format
    const d = new Date();
    const yyyymmdd = d.getFullYear() + zeroPad(d.getMonth()+1, 2)
        + this.zeroPad(d.getDate(), 2);

    let subdir = yyyymmdd;
    // Allow either boolean or a sub-directory to be specified

    if (typeof quarantine !== 'boolean' && quarantine !== 1) {
        subdir = path.join(quarantine, yyyymmdd);
    }

    const txn = connection?.transaction;
    if (!txn) return next();

    const base_dir = this.get_base_dir();
    const msg_dir  = path.join(base_dir, subdir);
    const tmp_path = path.join(base_dir, 'tmp', txn.uuid);
    const msg_path = path.join(msg_dir, txn.uuid);

    // Create all the directories recursively if they do not exist.
    // Then write the file to a temporary directory first, once this is
    // successful we hardlink the file to the final destination and then
    // remove the temporary file to guarantee a complete file in the
    // final destination.
    fs.promises.mkdir(msg_dir, { recursive: true })
        .catch(err => {
            connection.logerror(this, `Error creating directory: ${msg_dir}`);
            next();
        })
        .then(ok => {
            const ws = fs.createWriteStream(tmp_path);

            ws.on('error', err => {
                connection.logerror(this, `Error writing quarantine file: ${err.message}`);
                return next();
            });
            ws.on('close', () => {
                fs.link(tmp_path, msg_path, err => {
                    if (err) {
                        connection.logerror(this, `Error writing quarantine file: ${err}`);
                    }
                    else {
                        // Add a note to where we stored the message
                        txn.notes.quarantined = msg_path;
                        txn.results.add(this, { pass: msg_path, emit: true });
                        // Now delete the temporary file
                        fs.unlink(tmp_path, () => {});
                    }
                    // Using notes.quarantine_action to decide what to do after the message is quarantined.
                    // Format can be either action = [ code, msg ] or action = code
                    const action = (connection.notes.quarantine_action || txn.notes.quarantine_action);
                    if (!action) return next();
                    if (Array.isArray(action)) return next(action[0], action[1]);
                    return next(action);
                });
            });
            txn.message_stream.pipe(ws, { line_endings: '\n' });
        });
}
