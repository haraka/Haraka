'use strict';
/*eslint no-unused-vars: ["error", { "varsIgnorePattern": "queue_dir", "args": "none" }]*/

test.expect(14);

// What is tested:
// - get_mx plugin with DENY/DENYSOFT is simulated
// - found_mx with various errors is simulated
// - try_deliver with empty hmail.mxlist is called
// and it is tested that bounce/temp_fail gets called with DSN-params set

// we copy over here "test_queue_dir" from vm-sandbox to the queue_dir back
// (queue_dir is outbound-private var introduced at the beginning of outbound.js)
var queue_dir = test_queue_dir;

var util_hmailitem = require('./../fixtures/util_hmailitem');
var async          = require('async');
var dns            = require('dns');


var outbound_context = {
    TODOItem: exports.TODOItem,
    exports: exports,
};

async.series(
    [
        // test get-mx-deny triggers bounce(...)
        function (callback) {
            util_hmailitem.newMockHMailItem(outbound_context, test, {}, function(mock_hmail){
                var orig_bounce = HMailItem.prototype.bounce;
                HMailItem.prototype.bounce = function (err, opts) {
                    test.ok(true, 'get_mx=DENY: bounce function called');
                    /* dsn_code: 550,
                     dsn_status: '5.1.2',
                     dsn_action: 'failed' */
                    test.equal('5.1.2', this.todo.rcpt_to[0].dsn_status, 'get_mx=DENY dsn status = 5.1.2');
                }
                mock_hmail.domain = mock_hmail.todo.domain;
                HMailItem.prototype.get_mx_respond.apply(mock_hmail, [constants.deny, {}]);
                HMailItem.prototype.bounce = orig_bounce;
                callback(null, 1);
            });
        },
        // test get-mx-denysoft triggers temp_fail(...)
        function (callback) {
            util_hmailitem.newMockHMailItem(outbound_context, test, {}, function(mock_hmail){
                var orig_temp_fail = HMailItem.prototype.temp_fail;
                HMailItem.prototype.temp_fail = function (err, opts) {
                    test.ok(true, 'get_mx-DENYSOFT: temp_fail function called');
                    /*dsn_code: 450,
                     dsn_status: '4.1.2',
                     dsn_action: 'delayed' */
                    test.equal('4.1.2', this.todo.rcpt_to[0].dsn_status, 'get_mx=DENYSOFT dsn status = 4.1.2');
                }
                mock_hmail.domain = mock_hmail.todo.domain;
                HMailItem.prototype.get_mx_respond.apply(mock_hmail, [constants.denysoft, {}]);
                HMailItem.prototype.temp_fail = orig_temp_fail;
                callback(null, 1);
            });
        },
        // test found_mx({code:dns.NXDOMAIN}) triggers bounce(...)
        function (callback) {
            util_hmailitem.newMockHMailItem(outbound_context, test, {}, function(mock_hmail){
                var orig_bounce = HMailItem.prototype.bounce;
                HMailItem.prototype.bounce = function (err, opts) {
                    test.ok(true, 'found_mx({code: dns.NXDOMAIN}): bounce function called');
                    test.equal('5.1.2', this.todo.rcpt_to[0].dsn_status, 'found_mx({code: dns.NXDOMAIN}: dsn status = 5.1.2');
                }
                HMailItem.prototype.found_mx.apply(mock_hmail, [{code: dns.NXDOMAIN}, {}]);
                HMailItem.prototype.bounce = orig_bounce;
                callback(null, 1);
            });
        },
        // test found_mx({code:'NOMX'}) triggers bounce(...)
        function (callback) {
            util_hmailitem.newMockHMailItem(outbound_context, test, {}, function(mock_hmail){
                var orig_bounce = HMailItem.prototype.bounce;
                HMailItem.prototype.bounce = function (err, opts) {
                    test.ok(true, 'found_mx({code: "NOMX"}): bounce function called');
                    test.equal('5.1.2', this.todo.rcpt_to[0].dsn_status, 'found_mx({code: "NOMX"}: dsn status = 5.1.2');
                }
                HMailItem.prototype.found_mx.apply(mock_hmail, [{code: 'NOMX'}, {}]);
                HMailItem.prototype.bounce = orig_bounce;
                callback(null, 1);
            });
        },
        // test found_mx({code:'SOME-OTHER-ERR'}) triggers temp_fail(...)
        function (callback) {
            util_hmailitem.newMockHMailItem(outbound_context, test, {}, function(mock_hmail){
                var orig_temp_fail = HMailItem.prototype.temp_fail;
                HMailItem.prototype.temp_fail = function (err, opts) {
                    test.ok(true, 'found_mx({code: "SOME-OTHER-ERR"}): temp_fail function called');
                    test.equal('4.1.0', this.todo.rcpt_to[0].dsn_status, 'found_mx({code: "SOME-OTHER-ERR"}: dsn status = 4.1.0');
                }
                HMailItem.prototype.found_mx.apply(mock_hmail, [{code: 'SOME-OTHER-ERR'}, {}]);
                HMailItem.prototype.temp_fail = orig_temp_fail;
                callback(null, 1);
            });
        },
        // test found_mx(null, [{priority:0,exchange:''}]) triggers bounce(...)
        function (callback) {
            util_hmailitem.newMockHMailItem(outbound_context, test, {}, function(mock_hmail){
                var orig_bounce = HMailItem.prototype.bounce;
                HMailItem.prototype.bounce = function (err, opts) {
                    test.ok(true, 'found_mx(null, [{priority:0,exchange:""}]): bounce function called');
                    test.equal('5.1.2', this.todo.rcpt_to[0].dsn_status, 'found_mx(null, [{priority:0,exchange:""}]): dsn status = 5.1.2');
                }
                HMailItem.prototype.found_mx.apply(mock_hmail, [null, [{priority:0,exchange:''}]]);
                HMailItem.prototype.bounce = orig_bounce;
                callback(null, 1);
            });
        },
        // test try_deliver while hmail.mxlist=[] triggers bounce(...)
        function (callback) {
            util_hmailitem.newMockHMailItem(outbound_context, test, {}, function(mock_hmail){
                mock_hmail.mxlist = [];
                var orig_temp_fail = HMailItem.prototype.temp_fail;
                HMailItem.prototype.temp_fail = function (err, opts) {
                    test.ok(true, 'try_deliver while hmail.mxlist=[]: temp_fail function called');
                    test.equal('5.1.2', this.todo.rcpt_to[0].dsn_status, 'try_deliver while hmail.mxlist=[]: dsn status = 5.1.2');
                }
                HMailItem.prototype.try_deliver.apply(mock_hmail, []);
                HMailItem.prototype.temp_fail = orig_temp_fail;
                callback(null, 1);
            });
        },
    ],
    function (err, results) {
        test.done();
    }
);
