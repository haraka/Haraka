var dkim = require('./dkim');
var DKIMVerifyStream = dkim.DKIMVerifyStream;
var util = require('util');

var plugin = exports;

dkim.DKIMObject.prototype.debug = function (str) {
    plugin.logdebug(str);
}

DKIMVerifyStream.prototype.debug = function (str) {
    plugin.logdebug(str);
}

exports.hook_data_post = function(next, connection) {
    var self = this;
    var txn = connection.transaction;
    var verifier = new DKIMVerifyStream(function (err, result, results) {
        if (err) {
            connection.logerror(self, 'error=' + err);
        }
        if (!results) return next();
        results.forEach(function (res) {
            connection.auth_results(
              'dkim=' + res.result + 
              ((res.error) ? ' (' + res.error + ')' : '') + 
              ' header.i=' + res.identity
            );
            connection.loginfo(self, 'identity="' + res.identity + '" ' +
                                     'domain="' + res.domain + '" ' +
                                     'selector="' + res.selector + '" ' + 
                                     'result=' + res.result + ' ' +
                                     ((res.error) ? '(' + res.error + ')' : ''));
            // Add individual results to ResultStore
            if (res.result === 'pass') { 
                txn.results.add(self, { pass: res.domain }); 
            }
            else if (res.result === 'fail') { 
                txn.results.add(self, {
                    fail: res.domain + ((res.error) ? '(' + res.error + ')' : '') 
                }); 
            }
            else { 
                txn.results.add(self, { 
                    err: res.domain + ((res.error) ? '(' + res.error + ')' : '') 
                }); 
            }
        });
        connection.logdebug(self, JSON.stringify(results));
        // Store results for other plugins
        txn.notes.dkim_results = results;
        return next();
    }, ((plugin.timeout) ? plugin.timeout - 1 : 0));
    txn.message_stream.pipe(verifier, { line_endings: '\r\n' });
}
