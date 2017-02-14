var dkim = require('./dkim');
var DKIMVerifyStream = dkim.DKIMVerifyStream;

var plugin = exports;

dkim.DKIMObject.prototype.debug = function (str) {
    plugin.logdebug(str);
};

DKIMVerifyStream.prototype.debug = function (str) {
    plugin.logdebug(str);
};

exports.hook_data_post = function (next, connection) {
    var self = this;
    var txn = connection.transaction;
    var verifier = new DKIMVerifyStream(function (err, result, results) {
        if (err) {
            txn.results.add(self, { err: err });
            return next();
        }
        if (!results) {
            txn.results.add(self, { err: 'No results from DKIMVerifyStream' });
            return next();
        }
        results.forEach(function (res) {
            var res_err = ' (' + res.error + ')' ? res.error : '';
            connection.auth_results(
              'dkim=' + res.result + res_err +
              ' header.i=' + res.identity
            );
            connection.loginfo(self, 'identity="' + res.identity + '" ' +
                                     'domain="' + res.domain + '" ' +
                                     'selector="' + res.selector + '" ' +
                                     'result=' + res.result + res_err);

            // save to ResultStore
            var rs_obj = JSON.parse(JSON.stringify(res));
            if      (res.result === 'pass') { rs_obj.pass = res.domain; }
            else if (res.result === 'fail') { rs_obj.fail = res.domain + res_err; }
            else                            { rs_obj.err  = res.domain + res_err; }
            txn.results.add(self, rs_obj);
        });

        connection.logdebug(self, JSON.stringify(results));
        // Store results for other plugins
        txn.notes.dkim_results = results;
        next();
    }, ((plugin.timeout) ? plugin.timeout - 1 : 0));
    txn.message_stream.pipe(verifier, { line_endings: '\r\n' });
};
