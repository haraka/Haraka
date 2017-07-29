// esets
var fs = require('fs');
var child_process = require('child_process');
var virus_re = new RegExp('virus="([^"]+)"');

exports.hook_data_post = function (next, connection) {
    var plugin = this;
    var txn = connection.transaction;
    var cfg = this.config.get('esets.ini');

    // Write message to temporary file
    var tmpdir = cfg.main.tmpdir || '/tmp';
    var tmpfile = tmpdir + '/' + txn.uuid + '.esets';
    var ws = fs.createWriteStream(tmpfile);

    ws.once('error', function (err) {
        connection.logerror(plugin, 'Error writing temporary file: ' + err.message);
        return next();
    });

    var start_time;

    var wsOnClose = function (error, stdout, stderr) {
        // Remove the temporary file
        fs.unlink(tmpfile, function (){});

        // Timing
        var end_time = Date.now();
        var elapsed = end_time - start_time;

        // Debugging
        [stdout, stderr].forEach(function (channel) {
            if (channel) {
                var lines = channel.split('\n');
                for (var i=0; i<lines.length; i++) {
                    if (lines[i]) connection.logdebug(plugin, 'recv: ' + lines[i]);
                }
            }
        });

        // Get virus name
        var virus;
        if ((virus = virus_re.exec(stdout))) {
            virus = virus[1];
        }

        // Log a summary
        var exit_code = parseInt((error) ? error.code : 0)
        connection.loginfo(plugin, 'elapsed=' + elapsed + 'ms' +
                                   ' code=' + exit_code +
                                   (exit_code === 0 || (exit_code > 1 && exit_code < 4)
                                       ? ' virus="' + virus + '"'
                                       : ' error="' + (stdout || stderr || 'UNKNOWN').replace('\n',' ').trim() + '"'));

        // esets_cli returns non-zero exit on virus/error
        if (exit_code) {
            if (exit_code > 1 && exit_code < 4) {
                return next(DENY, 'Message is infected with ' + (virus || 'UNKNOWN'));
            }
            else {
                return next(DENYSOFT, 'Virus scanner error');
            }
        }
        return next();
    };

    ws.once('close', function () {
        start_time = Date.now();
        child_process.exec('LANG=C /opt/eset/esets/bin/esets_cli ' + tmpfile,
            { encoding: 'utf8', timeout: 30 * 1000 },
            wsOnClose);
    });

    txn.message_stream.pipe(ws, { line_endings: '\r\n' });
};
