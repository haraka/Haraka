"use strict";
/* jshint node: true */

var dkim = require('./dkim');
var DKIMVerifyStream = dkim.DKIMVerifyStream;
var util = require('util');

var plugin = exports;

dkim.DKIMObject.prototype.debug = function (str) {
    plugin.logdebug(str);
};

DKIMVerifyStream.prototype.debug = function (str) {
    plugin.logdebug(str);
};

exports.hook_data_post = function(next, connection) {
    var plugin = this;
    var txn = connection.transaction;
    var verifier = new DKIMVerifyStream(function (err, result, results) {
        if (err) {
            connection.logerror(plugin, 'error=' + err);
        }
        if (!results) return next();
        results.forEach(function (res) {
            connection.auth_results(
              'dkim=' + res.result + 
              ((res.error) ? ' (' + res.error + ')' : '') + 
              ' header.i=' + res.identity
            );
            connection.loginfo(plugin, 'identity="' + res.identity + '" ' +
                                     'domain="' + res.domain + '" ' + 
                                     'result=' + res.result + ' ' +
                                     ((res.error) ? ' (' + res.error + ')' : ''));

            if      (res.result === 'pass') { txn.results.add(plugin, { pass: res.domain }); }
            else if (res.result === 'fail') { txn.results.add(plugin, { fail: res.domain }); }
            else                            { txn.results.add(plugin, { err:  res.domain }); }
        });
        connection.logdebug(plugin, JSON.stringify(results));
        // Store results for other plugins
        txn.notes.dkim_results = results;
        return next();
    });
    txn.message_stream.pipe(verifier, { line_endings: '\r\n' });
};
