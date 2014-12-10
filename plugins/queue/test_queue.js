
var fs = require('fs');
var os = require('os');

var tempDir = os.tmpdir();

exports.hook_queue = function(next, connection) {
    var ws = fs.createWriteStream(tempDir + '/mail.eml');
    ws.once('close', function () {
        return next(OK);
    });
    connection.transaction.message_stream.pipe(ws);
};
