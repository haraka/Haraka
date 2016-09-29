'use strict';
/*eslint no-unused-vars: ["error", { "varsIgnorePattern": "queue_dir", "args": "none" }]*/

test.expect(54);

// What is tested:
// A simple SMTP conversation is made
// At one point, the mocked remote SMTP says "5XX" or "4XX"
// and we test that outbound.send_email is called with a RFC3464 bounce message
// (or, in case of 4XX: that temp_fail is called and dsn vars are available)

// we copy over here "test_queue_dir" from vm-sandbox to the queue_dir back
// (queue_dir is outbound-private var introduced at the beginning of outbound.js)
var queue_dir = test_queue_dir;

var util_hmailitem = require('./../fixtures/util_hmailitem');
var mock_sock      = require('./../fixtures/line_socket');
var async          = require('async');

var outbound_context = {
    TODOItem: exports.TODOItem,
    exports: exports,
};

async.series(
    [
        // test that MAIL FROM responded with 500 5.0.0 triggers
        // send_email() containing bounce msg with  our codes and message
        function (callback) {
            util_hmailitem.newMockHMailItem(outbound_context, test, {}, function(mock_hmail){
                var mock_socket = mock_sock.connect('testhost', 'testport');
                mock_socket.writable = true;

                var orig_send_email = exports.send_email;
                exports.send_email = function (from, to, contents, cb, opts) {
                    test.ok(true, 'outbound.send_email called');
                    test.ok(contents.match(/^Content-type: message\/delivery-status/m), 'its a bounce report');
                    test.ok(contents.match(/^Final-Recipient: rfc822;recipient@domain/m), 'bounce report contains final recipient');
                    test.ok(contents.match(/^Action: failed/m), 'DATA-5XX: bounce report contains action field');
                    test.ok(contents.match(/^Status: 5\.0\.0/m), 'bounce report contains status field with our ext. smtp code');
                    test.ok(contents.match(/Absolutely not acceptable\. Basic Test Only\./), 'original upstream message available');
                    exports.send_email = orig_send_email;
                    callback(null, 1);
                };

                // The playbook
                // from remote: This line is to be sent (from an mocked remote SMTP) to haraka outbound. This is done in this test.
                // from haraka: Expected answer from haraka-outbound to the mocked remote SMTP.
                //              'test' can hold a function(line) returning true for success, or a string tested for equality
                var testPlaybook = [
                    // Haraka connects, we say first
                    { 'from': 'remote', 'line': '220 testing-smtp' },

                    { 'from': 'haraka', 'test': function(line) { return line.match(/^EHLO /); }, 'description': 'Haraka should say EHLO', },
                    { 'from': 'remote', 'line': '220-testing-smtp' },
                    { 'from': 'remote', 'line': '220 8BITMIME' },

                    { 'from': 'haraka', 'test': 'MAIL FROM:<sender@domain>' },
                    { 'from': 'remote', 'line': '500 5.0.0 Absolutely not acceptable. Basic Test Only.' },

                    { 'from': 'haraka', 'test': 'RSET', end_test: true }, // this will trigger calling the callback
                ];

                util_hmailitem.playTestSmtpConversation(mock_hmail, mock_socket, test, testPlaybook, function() {

                });
            });
        },
        // test that early response of 3XX triggers temp_fail
        function (callback) {
            util_hmailitem.newMockHMailItem(outbound_context, test, {}, function(mock_hmail){
                var mock_socket = mock_sock.connect('testhost', 'testport');
                mock_socket.writable = true;

                var orig_temp_fail = HMailItem.prototype.temp_fail;
                HMailItem.prototype.temp_fail = function (err, opts) {
                    test.ok(true, 'early-3XX: outbound.temp_fail called');
                    test.equal('3.0.0', this.todo.rcpt_to[0].dsn_status, 'early-3XX: dsn status = 3.0.0');
                    test.equal('delayed', this.todo.rcpt_to[0].dsn_action, 'early-3XX: dsn action = delayed');
                    test.ok(this.todo.rcpt_to[0].dsn_smtp_response.match(/No time for you right now/), 'early-3XX: original upstream message available');
                    HMailItem.prototype.temp_fail = orig_temp_fail;
                    callback(null, 1);
                };
                var testPlaybook = [
                    { 'from': 'remote', 'line': '220 testing-smtp' },

                    { 'from': 'haraka', 'test': function(line) { return line.match(/^EHLO /); }, 'description': 'Haraka should say EHLO', },
                    { 'from': 'remote', 'line': '220-testing-smtp' },
                    { 'from': 'remote', 'line': '220 8BITMIME' },

                    { 'from': 'haraka', 'test': 'MAIL FROM:<sender@domain>' },
                    { 'from': 'remote', 'line': '300 3.0.0 No time for you right now' },

                    { 'from': 'haraka', 'test': 'RSET', end_test: true }, // this will trigger calling the callback
                ];

                util_hmailitem.playTestSmtpConversation(mock_hmail, mock_socket, test, testPlaybook, function() {

                });
            });
        },
        // test that response of 4XX for RCPT-TO triggers temp_fail
        function (callback) {
            util_hmailitem.newMockHMailItem(outbound_context, test, {}, function(mock_hmail){
                var mock_socket = mock_sock.connect('testhost', 'testport');
                mock_socket.writable = true;

                var orig_temp_fail = HMailItem.prototype.temp_fail;
                HMailItem.prototype.temp_fail = function (err, opts) {
                    test.ok(true, 'RCPT-TO-4XX: outbound.temp_fail called');
                    test.equal('4.0.0', this.todo.rcpt_to[0].dsn_status, 'RCPT-TO-4XX: dsn status = 4.0.0');
                    test.equal('delayed', this.todo.rcpt_to[0].dsn_action, 'RCPT-TO-4XX: dsn action = delayed');
                    test.ok(this.todo.rcpt_to[0].dsn_smtp_response.match(/Currently not available\. Try again later\./), 'RCPT-TO-4XX: original upstream message available');
                    HMailItem.prototype.temp_fail = orig_temp_fail;
                    callback(null, 1);
                };
                var testPlaybook = [
                    { 'from': 'remote', 'line': '220 testing-smtp' },

                    { 'from': 'haraka', 'test': function(line) { return line.match(/^EHLO /); }, 'description': 'Haraka should say EHLO', },
                    { 'from': 'remote', 'line': '220-testing-smtp' },
                    { 'from': 'remote', 'line': '220 8BITMIME' },

                    { 'from': 'haraka', 'test': 'MAIL FROM:<sender@domain>' },
                    { 'from': 'remote', 'line': '250 2.1.0 Ok' },

                    { 'from': 'haraka', 'test': 'RCPT TO:<recipient@domain>' },
                    { 'from': 'remote', 'line': '400 4.0.0 Currently not available. Try again later.' },

                    { 'from': 'haraka', 'test': 'RSET', end_test: true }, // this will trigger calling the callback
                ];

                util_hmailitem.playTestSmtpConversation(mock_hmail, mock_socket, test, testPlaybook, function() {

                });
            });
        },

        // test that response of 4XX for DATA triggers temp_fail
        function (callback) {
            util_hmailitem.newMockHMailItem(outbound_context, test, {}, function(mock_hmail){
                var mock_socket = mock_sock.connect('testhost', 'testport');
                mock_socket.writable = true;

                var orig_temp_fail = HMailItem.prototype.temp_fail;
                HMailItem.prototype.temp_fail = function (err, opts) {
                    test.ok(true, 'DATA-4XX: outbound.temp_fail called');
                    test.equal('4.6.0', this.todo.rcpt_to[0].dsn_status, 'DATA-4XX: dsn status = 4.6.0');
                    test.equal('delayed', this.todo.rcpt_to[0].dsn_action, 'DATA-4XX: dsn action = delayed');
                    test.ok(this.todo.rcpt_to[0].dsn_smtp_response.match(/Currently I do not like ascii art cats\./), 'DATA-4XX: original upstream message available');
                    HMailItem.prototype.temp_fail = orig_temp_fail;
                    callback(null, 1);
                };
                var testPlaybook = [
                    { 'from': 'remote', 'line': '220 testing-smtp' },

                    { 'from': 'haraka', 'test': function(line) { return line.match(/^EHLO /); }, 'description': 'Haraka should say EHLO', },
                    { 'from': 'remote', 'line': '220-testing-smtp' },
                    { 'from': 'remote', 'line': '220 8BITMIME' },

                    { 'from': 'haraka', 'test': 'MAIL FROM:<sender@domain>' },
                    { 'from': 'remote', 'line': '250 2.1.0 Ok' },

                    { 'from': 'haraka', 'test': 'RCPT TO:<recipient@domain>' },
                    { 'from': 'remote', 'line': '250 2.1.5 Ok' },

                    { 'from': 'haraka', 'test': 'DATA' },
                    // haraka will send us more lines
                    { 'from': 'remote', 'line': '450 4.6.0 Currently I do not like ascii art cats.' },

                    { 'from': 'haraka', 'test': 'RSET', end_test: true }, // this will trigger calling the callback
                ];

                util_hmailitem.playTestSmtpConversation(mock_hmail, mock_socket, test, testPlaybook, function() {

                });
            });
        },
        // test that response of 5XX for RCPT-TO triggers
        // send_email() containing bounce msg with  our codes and message
        function (callback) {
            util_hmailitem.newMockHMailItem(outbound_context, test, {}, function(mock_hmail){
                var mock_socket = mock_sock.connect('testhost', 'testport');
                mock_socket.writable = true;

                var orig_send_email = exports.send_email;
                exports.send_email = function (from, to, contents, cb, opts) {
                    test.ok(true, 'RCPT-TO-5XX: outbound.send_email called');
                    test.ok(contents.match(/^Content-type: message\/delivery-status/m), 'RCPT-TO-5XX: its a bounce report');
                    test.ok(contents.match(/^Final-Recipient: rfc822;recipient@domain/m), 'RCPT-TO-5XX:  bounce report contains final recipient');
                    test.ok(contents.match(/^Action: failed/m), 'DATA-5XX: bounce report contains action field');
                    test.ok(contents.match(/^Status: 5\.1\.1/m), 'RCPT-TO-5XX: bounce report contains status field with our ext. smtp code');
                    test.ok(contents.match(/Not available and will not come back/), 'RCPT-TO-5XX: original upstream message available');
                    exports.send_email = orig_send_email;
                    callback(null, 1);
                };
                var testPlaybook = [
                    { 'from': 'remote', 'line': '220 testing-smtp' },

                    { 'from': 'haraka', 'test': function(line) { return line.match(/^EHLO /); }, 'description': 'Haraka should say EHLO', },
                    { 'from': 'remote', 'line': '220-testing-smtp' },
                    { 'from': 'remote', 'line': '220 8BITMIME' },

                    { 'from': 'haraka', 'test': 'MAIL FROM:<sender@domain>' },
                    { 'from': 'remote', 'line': '250 2.1.0 Ok' },

                    { 'from': 'haraka', 'test': 'RCPT TO:<recipient@domain>' },
                    { 'from': 'remote', 'line': '550 5.1.1 Not available and will not come back' },

                    { 'from': 'haraka', 'test': 'RSET', end_test: true }, // this will trigger calling the callback
                ];

                util_hmailitem.playTestSmtpConversation(mock_hmail, mock_socket, test, testPlaybook, function() {

                });
            });
        },
        // test that response of 5XX for DATA triggers
        // send_email() containing bounce msg with  our codes and message
        function (callback) {
            util_hmailitem.newMockHMailItem(outbound_context, test, {}, function(mock_hmail){
                var mock_socket = mock_sock.connect('testhost', 'testport');
                mock_socket.writable = true;

                var orig_send_email = exports.send_email;
                exports.send_email = function (from, to, contents, cb, opts) {
                    test.ok(true, 'DATA-5XX: outbound.send_email called');
                    test.ok(contents.match(/^Content-type: message\/delivery-status/m), 'DATA-5XX: its a bounce report');
                    test.ok(contents.match(/^Final-Recipient: rfc822;recipient@domain/m), 'DATA-5XX:  bounce report contains final recipient');
                    test.ok(contents.match(/^Action: failed/m), 'DATA-5XX: bounce report contains action field');
                    test.ok(contents.match(/^Status: 5\.6\.0/m), 'DATA-5XX: bounce report contains status field with our ext. smtp code');
                    test.ok(contents.match(/I never did and will like ascii art cats/), 'DATA-5XX: original upstream message available');
                    exports.send_email = orig_send_email;
                    callback(null, 1);
                };
                var testPlaybook = [
                    { 'from': 'remote', 'line': '220 testing-smtp' },

                    { 'from': 'haraka', 'test': function(line) { return line.match(/^EHLO /); }, 'description': 'Haraka should say EHLO', },
                    { 'from': 'remote', 'line': '220-testing-smtp' },
                    { 'from': 'remote', 'line': '220 8BITMIME' },

                    { 'from': 'haraka', 'test': 'MAIL FROM:<sender@domain>' },
                    { 'from': 'remote', 'line': '250 2.1.0 Ok' },

                    { 'from': 'haraka', 'test': 'RCPT TO:<recipient@domain>' },
                    { 'from': 'remote', 'line': '250 2.1.5 Ok' },

                    { 'from': 'haraka', 'test': 'DATA' },
                    // haraka will send us more lines
                    { 'from': 'remote', 'line': '550 5.6.0 I never did and will like ascii art cats.' },

                    { 'from': 'haraka', 'test': 'RSET', end_test: true }, // this will trigger calling the callback
                ];

                util_hmailitem.playTestSmtpConversation(mock_hmail, mock_socket, test, testPlaybook, function() {

                });
            });
        },
    ],
    function (err, results) {
        test.done();
    }
);
