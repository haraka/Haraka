const fs = require('node:fs');
const os = require('node:os');

const tempDir = os.tmpdir();

exports.hook_queue = function (next, connection) {
    const txn = connection?.transaction;
    if (!txn) return next();

    const file_path = `${tempDir}/mail_${txn.uuid}.eml`
    const ws = fs.createWriteStream(file_path);
    connection.logdebug(this, `Saving to ${file_path}`);
    ws.once('close', () => next(OK));
    connection.transaction.message_stream.pipe(ws);
}
