
var fs   = require('fs');

exports.hook_queue = function(next, connection) {
    var ws = fs.createWriteStream('/tmp/mail.eml');
    ws.once('close', function () {
        return next(OK);
    });
    connection.transaction.message_stream.pipe(ws);
};
