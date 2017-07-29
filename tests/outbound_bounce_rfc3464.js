'use strict';

// Testing bounce email contents related to errors occuring during STMP dialog

// About running the tests:
// - Making a folder for queuing files
// - Creating a HMailItem instance using fixtures/util_hmailitem
// - Talk some STMP in the playbook
// - Test the outcome by replacing trigger functions with our testing code (outbound.send_email, HMailItem.temp_fail, ...)
//   At one point, the mocked remote SMTP says "5XX" or "4XX" and we test that
//   * outbound.send_email is called with a RFC3464 bounce message
//   * or, in case of 4XX: that temp_fail is called and dsn vars are available)

require('../configfile').watch_files = false;
var fs          = require('fs');
var path        = require('path');
var util_hmailitem = require('./fixtures/util_hmailitem');
var TODOItem    = require('../outbound/todo');
var HMailItem    = require('../outbound/hmail');
var ob_cfg      = require('../outbound/config');
var outbound    = require('../outbound');
var mock_sock   = require('./fixtures/line_socket');

ob_cfg.pool_concurrency_max = 0;

var outbound_context = {
    TODOItem: TODOItem,
    exports: outbound
};

var queue_dir = path.resolve(__dirname, 'test-queue');

exports.bounce_3464 = {
    setUp : function (done) {
        fs.exists(queue_dir, function (exists) {
            if (exists) {
                done();
            }
            else {
                fs.mkdir(queue_dir, function (err) {
                    if (err) {
                        return done(err);
                    }
                    done();
                });
            }
        });
    },
    tearDown: function (done) {
        fs.exists(queue_dir, function (exists) {
            if (exists) {
                var files = fs.readdirSync(queue_dir);
                files.forEach(function (file,index){
                    var curPath = path.resolve(queue_dir, file);
                    if (fs.lstatSync(curPath).isDirectory()) { // recurse
                        return done(new Error('did not expect an sub folder here ("' + curPath + '")! cancel'));
                    }
                });
                files.forEach(function (file,index){
                    var curPath = path.resolve(queue_dir, file);
                    fs.unlinkSync(curPath);
                });
                done();
            }
            else {
                done();
            }
        });
    },
    'test MAIL FROM responded with 500 5.0.0 triggers send_email() containing bounce msg with codes and message': function (test) {
        test.expect(9);

        util_hmailitem.newMockHMailItem(outbound_context, test, {}, function (mock_hmail){
            var mock_socket = mock_sock.connect('testhost', 'testport');
            mock_socket.writable = true;

            var orig_send_email = outbound_context.exports.send_email;
            outbound_context.exports.send_email = function (from, to, contents, cb, opts) {
                test.ok(true, 'outbound.send_email called');
                test.ok(contents.match(/^Content-type: message\/delivery-status/m), 'its a bounce report');
                test.ok(contents.match(/^Final-Recipient: rfc822;recipient@domain/m), 'bounce report contains final recipient');
                test.ok(contents.match(/^Action: failed/m), 'DATA-5XX: bounce report contains action field');
                test.ok(contents.match(/^Status: 5\.0\.0/m), 'bounce report contains status field with ext. smtp code');
                test.ok(contents.match(/Absolutely not acceptable\. Basic Test Only\./), 'original upstream message available');
                outbound_context.exports.send_email = orig_send_email;

                test.done();
            };

            // The playbook
            // from remote: This line is to be sent (from an mocked remote SMTP) to haraka outbound. This is done in this test.
            // from haraka: Expected answer from haraka-outbound to the mocked remote SMTP.
            //              'test' can hold a function(line) returning true for success, or a string tested for equality
            var testPlaybook = [
                // Haraka connects, we say first
                { 'from': 'remote', 'line': '220 testing-smtp' },

                { 'from': 'haraka', 'test': function (line) { return line.match(/^EHLO /); }, 'description': 'Haraka should say EHLO' },
                { 'from': 'remote', 'line': '220-testing-smtp' },
                { 'from': 'remote', 'line': '220 8BITMIME' },

                { 'from': 'haraka', 'test': 'MAIL FROM:<sender@domain>' },
                { 'from': 'remote', 'line': '500 5.0.0 Absolutely not acceptable. Basic Test Only.' },

                { 'from': 'haraka', 'test': 'QUIT', end_test: true }, // this will trigger calling the callback
            ];

            util_hmailitem.playTestSmtpConversation(mock_hmail, mock_socket, test, testPlaybook, function () {

            });
        });
    },
    'test that early response of 3XX triggers temp_fail': function (test) {
        test.expect(7);

        util_hmailitem.newMockHMailItem(outbound_context, test, {}, function (mock_hmail){
            var mock_socket = mock_sock.connect('testhost', 'testport');
            mock_socket.writable = true;

            var orig_temp_fail = HMailItem.prototype.temp_fail;
            HMailItem.prototype.temp_fail = function (err, opts) {
                test.ok(true, 'early-3XX: outbound.temp_fail called');
                test.equal('3.0.0', this.todo.rcpt_to[0].dsn_status, 'early-3XX: dsn status = 3.0.0');
                test.equal('delayed', this.todo.rcpt_to[0].dsn_action, 'early-3XX: dsn action = delayed');
                test.ok(this.todo.rcpt_to[0].dsn_smtp_response.match(/No time for you right now/), 'early-3XX: original upstream message available');
                HMailItem.prototype.temp_fail = orig_temp_fail;
                test.done();
            };
            var testPlaybook = [
                { 'from': 'remote', 'line': '220 testing-smtp' },

                { 'from': 'haraka', 'test': function (line) { return line.match(/^EHLO /); }, 'description': 'Haraka should say EHLO' },
                { 'from': 'remote', 'line': '220-testing-smtp' },
                { 'from': 'remote', 'line': '220 8BITMIME' },

                { 'from': 'haraka', 'test': 'MAIL FROM:<sender@domain>' },
                { 'from': 'remote', 'line': '300 3.0.0 No time for you right now' },

                { 'from': 'haraka', 'test': 'QUIT', end_test: true }, // this will trigger calling the callback
            ];

            util_hmailitem.playTestSmtpConversation(mock_hmail, mock_socket, test, testPlaybook, function () {

            });
        });
    },
    'test that response of 4XX for RCPT-TO triggers temp_fail': function (test) {
        test.expect(8);

        util_hmailitem.newMockHMailItem(outbound_context, test, {}, function (mock_hmail){
            var mock_socket = mock_sock.connect('testhost', 'testport');
            mock_socket.writable = true;

            var orig_temp_fail = HMailItem.prototype.temp_fail;
            HMailItem.prototype.temp_fail = function (err, opts) {
                test.ok(true, 'RCPT-TO-4XX: outbound.temp_fail called');
                test.equal('4.0.0', this.todo.rcpt_to[0].dsn_status, 'RCPT-TO-4XX: dsn status = 4.0.0');
                test.equal('delayed', this.todo.rcpt_to[0].dsn_action, 'RCPT-TO-4XX: dsn action = delayed');
                test.ok(this.todo.rcpt_to[0].dsn_smtp_response.match(/Currently not available\. Try again later\./), 'RCPT-TO-4XX: original upstream message available');
                HMailItem.prototype.temp_fail = orig_temp_fail;
                test.done();
            };
            var testPlaybook = [
                { 'from': 'remote', 'line': '220 testing-smtp' },

                { 'from': 'haraka', 'test': function (line) { return line.match(/^EHLO /); }, 'description': 'Haraka should say EHLO' },
                { 'from': 'remote', 'line': '220-testing-smtp' },
                { 'from': 'remote', 'line': '220 8BITMIME' },

                { 'from': 'haraka', 'test': 'MAIL FROM:<sender@domain>' },
                { 'from': 'remote', 'line': '250 2.1.0 Ok' },

                { 'from': 'haraka', 'test': 'RCPT TO:<recipient@domain>' },
                { 'from': 'remote', 'line': '400 4.0.0 Currently not available. Try again later.' },

                { 'from': 'haraka', 'test': 'QUIT', end_test: true }, // this will trigger calling the callback
            ];

            util_hmailitem.playTestSmtpConversation(mock_hmail, mock_socket, test, testPlaybook, function () {

            });
        });
    },
    'test that response of 4XX for DATA triggers temp_fail': function (test) {
        test.expect(9);

        util_hmailitem.newMockHMailItem(outbound_context, test, {}, function (mock_hmail){
            var mock_socket = mock_sock.connect('testhost', 'testport');
            mock_socket.writable = true;

            var orig_temp_fail = HMailItem.prototype.temp_fail;
            HMailItem.prototype.temp_fail = function (err, opts) {
                test.ok(true, 'DATA-4XX: outbound.temp_fail called');
                test.equal('4.6.0', this.todo.rcpt_to[0].dsn_status, 'DATA-4XX: dsn status = 4.6.0');
                test.equal('delayed', this.todo.rcpt_to[0].dsn_action, 'DATA-4XX: dsn action = delayed');
                test.ok(this.todo.rcpt_to[0].dsn_smtp_response.match(/Currently I do not like ascii art cats\./), 'DATA-4XX: original upstream message available');
                HMailItem.prototype.temp_fail = orig_temp_fail;
                test.done();
            };
            var testPlaybook = [
                { 'from': 'remote', 'line': '220 testing-smtp' },

                { 'from': 'haraka', 'test': function (line) { return line.match(/^EHLO /); }, 'description': 'Haraka should say EHLO' },
                { 'from': 'remote', 'line': '220-testing-smtp' },
                { 'from': 'remote', 'line': '220 8BITMIME' },

                { 'from': 'haraka', 'test': 'MAIL FROM:<sender@domain>' },
                { 'from': 'remote', 'line': '250 2.1.0 Ok' },

                { 'from': 'haraka', 'test': 'RCPT TO:<recipient@domain>' },
                { 'from': 'remote', 'line': '250 2.1.5 Ok' },

                { 'from': 'haraka', 'test': 'DATA' },
                // haraka will send us more lines
                { 'from': 'remote', 'line': '450 4.6.0 Currently I do not like ascii art cats.' },

                { 'from': 'haraka', 'test': 'QUIT', end_test: true }, // this will trigger calling the callback
            ];

            util_hmailitem.playTestSmtpConversation(mock_hmail, mock_socket, test, testPlaybook, function () {

            });
        });
    },
    'test that response of 5XX for RCPT-TO triggers send_email() containing bounce msg with codes and message': function (test) {
        test.expect(10);

        util_hmailitem.newMockHMailItem(outbound_context, test, {}, function (mock_hmail){
            var mock_socket = mock_sock.connect('testhost', 'testport');
            mock_socket.writable = true;

            var orig_send_email = outbound_context.exports.send_email;
            outbound_context.exports.send_email = function (from, to, contents, cb, opts) {
                test.ok(true, 'RCPT-TO-5XX: outbound.send_email called');
                test.ok(contents.match(/^Content-type: message\/delivery-status/m), 'RCPT-TO-5XX: its a bounce report');
                test.ok(contents.match(/^Final-Recipient: rfc822;recipient@domain/m), 'RCPT-TO-5XX:  bounce report contains final recipient');
                test.ok(contents.match(/^Action: failed/m), 'DATA-5XX: bounce report contains action field');
                test.ok(contents.match(/^Status: 5\.1\.1/m), 'RCPT-TO-5XX: bounce report contains status field with our ext. smtp code');
                test.ok(contents.match(/Not available and will not come back/), 'RCPT-TO-5XX: original upstream message available');
                outbound_context.exports.send_email = orig_send_email;
                test.done();
            };
            var testPlaybook = [
                { 'from': 'remote', 'line': '220 testing-smtp' },

                { 'from': 'haraka', 'test': function (line) { return line.match(/^EHLO /); }, 'description': 'Haraka should say EHLO' },
                { 'from': 'remote', 'line': '220-testing-smtp' },
                { 'from': 'remote', 'line': '220 8BITMIME' },

                { 'from': 'haraka', 'test': 'MAIL FROM:<sender@domain>' },
                { 'from': 'remote', 'line': '250 2.1.0 Ok' },

                { 'from': 'haraka', 'test': 'RCPT TO:<recipient@domain>' },
                { 'from': 'remote', 'line': '550 5.1.1 Not available and will not come back' },

                { 'from': 'haraka', 'test': 'QUIT', end_test: true }, // this will trigger calling the callback
            ];

            util_hmailitem.playTestSmtpConversation(mock_hmail, mock_socket, test, testPlaybook, function () {

            });
        });
    },
    'test that response of 5XX for DATA triggers send_email() containing bounce msg with codes and message': function (test) {
        test.expect(11);

        util_hmailitem.newMockHMailItem(outbound_context, test, {}, function (mock_hmail){
            var mock_socket = mock_sock.connect('testhost', 'testport');
            mock_socket.writable = true;

            var orig_send_email = outbound_context.exports.send_email;
            outbound_context.exports.send_email = function (from, to, contents, cb, opts) {
                test.ok(true, 'DATA-5XX: outbound.send_email called');
                test.ok(contents.match(/^Content-type: message\/delivery-status/m), 'DATA-5XX: its a bounce report');
                test.ok(contents.match(/^Final-Recipient: rfc822;recipient@domain/m), 'DATA-5XX:  bounce report contains final recipient');
                test.ok(contents.match(/^Action: failed/m), 'DATA-5XX: bounce report contains action field');
                test.ok(contents.match(/^Status: 5\.6\.0/m), 'DATA-5XX: bounce report contains status field with our ext. smtp code');
                test.ok(contents.match(/I never did and will like ascii art cats/), 'DATA-5XX: original upstream message available');
                outbound_context.exports.send_email = orig_send_email;
                test.done();
            };
            var testPlaybook = [
                { 'from': 'remote', 'line': '220 testing-smtp' },

                { 'from': 'haraka', 'test': function (line) { return line.match(/^EHLO /); }, 'description': 'Haraka should say EHLO' },
                { 'from': 'remote', 'line': '220-testing-smtp' },
                { 'from': 'remote', 'line': '220 8BITMIME' },

                { 'from': 'haraka', 'test': 'MAIL FROM:<sender@domain>' },
                { 'from': 'remote', 'line': '250 2.1.0 Ok' },

                { 'from': 'haraka', 'test': 'RCPT TO:<recipient@domain>' },
                { 'from': 'remote', 'line': '250 2.1.5 Ok' },

                { 'from': 'haraka', 'test': 'DATA' },
                // haraka will send us more lines
                { 'from': 'remote', 'line': '550 5.6.0 I never did and will like ascii art cats.' },

                { 'from': 'haraka', 'test': 'QUIT', end_test: true }, // this will trigger calling the callback
            ];

            util_hmailitem.playTestSmtpConversation(mock_hmail, mock_socket, test, testPlaybook, function () {

            });
        });
    },
}

