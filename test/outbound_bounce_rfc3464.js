'use strict';

// Testing bounce email contents related to errors occuring during SMTP dialog

// About running the tests:
// - Making a folder for queuing files
// - Creating a HMailItem instance using fixtures/util_hmailitem
// - Talk some SMTP in the playbook
// - Test the outcome by replacing trigger functions with our testing code (outbound.send_email, HMailItem.temp_fail, ...)
//   At one point, the mocked remote SMTP says "5XX" or "4XX" and we test that
//   * outbound.send_email is called with a RFC3464 bounce message
//   * or, in case of 4XX: that temp_fail is called and dsn vars are available)

const assert = require('node:assert')
const fs          = require('node:fs');
const path        = require('node:path');

const util_hmailitem = require('./fixtures/util_hmailitem');
const TODOItem    = require('../outbound/todo');
const HMailItem   = require('../outbound/hmail');
const obc         = require('../outbound/config');
const outbound    = require('../outbound');
const mock_sock   = require('./fixtures/line_socket');

obc.cfg.pool_concurrency_max = 0;

const outbound_context = {
    TODOItem,
    exports: outbound
}

const queue_dir = path.resolve(__dirname, 'test-queue');

describe('outbound_bounce_rfc3464', () => {
    beforeEach((done) => {
        fs.exists(queue_dir, exists => {
            if (exists) return done();

            fs.mkdir(queue_dir, err => {
                if (err) return done(err);
                done();
            })
        })
    })

    afterEach((done) => {
        fs.exists(queue_dir, exists => {
            if (!exists) return done()

            const files = fs.readdirSync(queue_dir);
            files.forEach((file,index) => {
                const curPath = path.resolve(queue_dir, file);
                if (fs.lstatSync(curPath).isDirectory()) { // recurse
                    return done(new Error(`did not expect an sub folder here ("${curPath}")! cancel`));
                }
            })
            files.forEach((file,index) => {
                const curPath = path.resolve(queue_dir, file);
                fs.unlinkSync(curPath);
            })
            done();
        })
    })

    it('test MAIL FROM responded with 500 5.0.0 triggers send_email() containing bounce msg with codes and message', (done) => {

        util_hmailitem.newMockHMailItem(outbound_context, done, {}, (mock_hmail) => {
            const mock_socket = mock_sock.connect('testhost', 'testport');
            mock_socket.writable = true;

            const orig_send_email = outbound_context.exports.send_email;

            outbound_context.exports.send_email = (from, to, contents, cb, opts) => {
                assert.ok(true, 'outbound.send_email called');
                assert.ok(contents.match(/^Content-type: message\/delivery-status/m), 'its a bounce report');
                assert.ok(contents.match(/^Final-Recipient: rfc822;recipient@domain/m), 'bounce report contains final recipient');
                assert.ok(contents.match(/^Action: failed/m), 'DATA-5XX: bounce report contains action field');
                assert.ok(contents.match(/^Status: 5\.0\.0/m), 'bounce report contains status field with ext. smtp code');
                assert.ok(contents.match(/Absolutely not acceptable\. Basic Test Only\./), 'original upstream message available');
                outbound_context.exports.send_email = orig_send_email;
                done()
            }

            // The playbook
            // from remote: This line is to be sent (from an mocked remote SMTP) to haraka outbound. This is done in this test.
            // from haraka: Expected answer from haraka-outbound to the mocked remote SMTP.
            //              'test' can hold a function(line) returning true for success, or a string tested for equality
            const testPlaybook = [
                // Haraka connects, we say first
                { 'from': 'remote', 'line': '220 testing-smtp' },

                { 'from': 'haraka', 'test': line => line.match(/^EHLO /), 'description': 'Haraka should say EHLO' },
                { 'from': 'remote', 'line': '220-testing-smtp' },
                { 'from': 'remote', 'line': '220 8BITMIME' },

                { 'from': 'haraka', 'test': 'MAIL FROM:<sender@domain>' },
                { 'from': 'remote', 'line': '500 5.0.0 Absolutely not acceptable. Basic Test Only.' },

                { 'from': 'haraka', 'test': 'QUIT', end_test: true }, // this will trigger calling the callback
            ];

            util_hmailitem.playTestSmtpConversation(mock_hmail, mock_socket, done, testPlaybook, () => {
            })
        })
    })

    it('test that early response of 3XX triggers temp_fail', (done) => {

        util_hmailitem.newMockHMailItem(outbound_context, done, {}, mock_hmail => {
            const mock_socket = mock_sock.connect('testhost', 'testport');
            mock_socket.writable = true;

            const orig_temp_fail = HMailItem.prototype.temp_fail;
            HMailItem.prototype.temp_fail = function (err, opts) {
                assert.ok(true, 'early-3XX: outbound.temp_fail called');
                assert.equal('3.0.0', this.todo.rcpt_to[0].dsn_status, 'early-3XX: dsn status = 3.0.0');
                assert.equal('delayed', this.todo.rcpt_to[0].dsn_action, 'early-3XX: dsn action = delayed');
                assert.ok(this.todo.rcpt_to[0].dsn_smtp_response.match(/No time for you right now/), 'early-3XX: original upstream message available');
                HMailItem.prototype.temp_fail = orig_temp_fail;
                done()
            }

            const testPlaybook = [
                { 'from': 'remote', 'line': '220 testing-smtp' },

                { 'from': 'haraka', 'test': line => line.match(/^EHLO /), 'description': 'Haraka should say EHLO' },
                { 'from': 'remote', 'line': '220-testing-smtp' },
                { 'from': 'remote', 'line': '220 8BITMIME' },

                { 'from': 'haraka', 'test': 'MAIL FROM:<sender@domain>' },
                { 'from': 'remote', 'line': '300 3.0.0 No time for you right now' },

                { 'from': 'haraka', 'test': 'QUIT', end_test: true }, // this will trigger calling the callback
            ];

            util_hmailitem.playTestSmtpConversation(mock_hmail, mock_socket, done, testPlaybook, () => {

            })
        })
    })

    it('test that response of 4XX for RCPT-TO triggers temp_fail', (done) => {

        util_hmailitem.newMockHMailItem(outbound_context, done, {}, mock_hmail => {
            const mock_socket = mock_sock.connect('testhost', 'testport');
            mock_socket.writable = true;

            const orig_temp_fail = HMailItem.prototype.temp_fail;
            HMailItem.prototype.temp_fail = function (err, opts) {
                assert.ok(true, 'RCPT-TO-4XX: outbound.temp_fail called');
                assert.equal('4.0.0', this.todo.rcpt_to[0].dsn_status, 'RCPT-TO-4XX: dsn status = 4.0.0');
                assert.equal('delayed', this.todo.rcpt_to[0].dsn_action, 'RCPT-TO-4XX: dsn action = delayed');
                assert.ok(this.todo.rcpt_to[0].dsn_smtp_response.match(/Currently not available\. Try again later\./), 'RCPT-TO-4XX: original upstream message available');
                HMailItem.prototype.temp_fail = orig_temp_fail;
                done()
            };
            const testPlaybook = [
                { 'from': 'remote', 'line': '220 testing-smtp' },

                { 'from': 'haraka', 'test': line => line.match(/^EHLO /), 'description': 'Haraka should say EHLO' },
                { 'from': 'remote', 'line': '220-testing-smtp' },
                { 'from': 'remote', 'line': '220 8BITMIME' },

                { 'from': 'haraka', 'test': 'MAIL FROM:<sender@domain>' },
                { 'from': 'remote', 'line': '250 2.1.0 Ok' },

                { 'from': 'haraka', 'test': 'RCPT TO:<recipient@domain>' },
                { 'from': 'remote', 'line': '400 4.0.0 Currently not available. Try again later.' },

                { 'from': 'haraka', 'test': 'QUIT', end_test: true }, // this will trigger calling the callback
            ];

            util_hmailitem.playTestSmtpConversation(mock_hmail, mock_socket, done, testPlaybook, () => {})
        })
    })

    it('test that response of 4XX for DATA triggers temp_fail', (done) => {

        util_hmailitem.newMockHMailItem(outbound_context, done, {}, mock_hmail => {
            const mock_socket = mock_sock.connect('testhost', 'testport');
            mock_socket.writable = true;

            const orig_temp_fail = HMailItem.prototype.temp_fail;
            HMailItem.prototype.temp_fail = function (err, opts) {
                assert.ok(true, 'DATA-4XX: outbound.temp_fail called');
                assert.equal('4.6.0', this.todo.rcpt_to[0].dsn_status, 'DATA-4XX: dsn status = 4.6.0');
                assert.equal('delayed', this.todo.rcpt_to[0].dsn_action, 'DATA-4XX: dsn action = delayed');
                assert.ok(this.todo.rcpt_to[0].dsn_smtp_response.match(/Currently I do not like ascii art cats\./), 'DATA-4XX: original upstream message available');
                HMailItem.prototype.temp_fail = orig_temp_fail;
                done()
            };
            const testPlaybook = [
                { 'from': 'remote', 'line': '220 testing-smtp' },

                { 'from': 'haraka', 'test': line => line.match(/^EHLO /), 'description': 'Haraka should say EHLO' },
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

            util_hmailitem.playTestSmtpConversation(mock_hmail, mock_socket, done, testPlaybook, () => {

            })
        })
    })

    it('test that response of 5XX for RCPT-TO triggers send_email() containing bounce msg with codes and message', (done) => {

        util_hmailitem.newMockHMailItem(outbound_context, done, {}, mock_hmail => {
            const mock_socket = mock_sock.connect('testhost', 'testport');
            mock_socket.writable = true;

            const orig_send_email = outbound_context.exports.send_email;
            outbound_context.exports.send_email = (from, to, contents, cb, opts) => {
                assert.ok(true, 'RCPT-TO-5XX: outbound.send_email called');
                assert.ok(contents.match(/^Content-type: message\/delivery-status/m), 'RCPT-TO-5XX: its a bounce report');
                assert.ok(contents.match(/^Final-Recipient: rfc822;recipient@domain/m), 'RCPT-TO-5XX:  bounce report contains final recipient');
                assert.ok(contents.match(/^Action: failed/m), 'DATA-5XX: bounce report contains action field');
                assert.ok(contents.match(/^Status: 5\.1\.1/m), 'RCPT-TO-5XX: bounce report contains status field with our ext. smtp code');
                assert.ok(contents.match(/Not available and will not come back/), 'RCPT-TO-5XX: original upstream message available');
                outbound_context.exports.send_email = orig_send_email;
                done()
            };
            const testPlaybook = [
                { 'from': 'remote', 'line': '220 testing-smtp' },

                { 'from': 'haraka', 'test': line => line.match(/^EHLO /), 'description': 'Haraka should say EHLO' },
                { 'from': 'remote', 'line': '220-testing-smtp' },
                { 'from': 'remote', 'line': '220 8BITMIME' },

                { 'from': 'haraka', 'test': 'MAIL FROM:<sender@domain>' },
                { 'from': 'remote', 'line': '250 2.1.0 Ok' },

                { 'from': 'haraka', 'test': 'RCPT TO:<recipient@domain>' },
                { 'from': 'remote', 'line': '550 5.1.1 Not available and will not come back' },

                { 'from': 'haraka', 'test': 'QUIT', end_test: true }, // this will trigger calling the callback
            ];

            util_hmailitem.playTestSmtpConversation(mock_hmail, mock_socket, done, testPlaybook, () => {})
        })
    })

    it('test that response of 5XX for DATA triggers send_email() containing bounce msg with codes and message', (done) => {

        util_hmailitem.newMockHMailItem(outbound_context, done, {}, mock_hmail => {
            const mock_socket = mock_sock.connect('testhost', 'testport');
            mock_socket.writable = true;

            const orig_send_email = outbound_context.exports.send_email;
            outbound_context.exports.send_email = (from, to, contents, cb, opts) => {
                assert.ok(true, 'DATA-5XX: outbound.send_email called');
                assert.ok(contents.match(/^Content-type: message\/delivery-status/m), 'DATA-5XX: its a bounce report');
                assert.ok(contents.match(/^Final-Recipient: rfc822;recipient@domain/m), 'DATA-5XX:  bounce report contains final recipient');
                assert.ok(contents.match(/^Action: failed/m), 'DATA-5XX: bounce report contains action field');
                assert.ok(contents.match(/^Status: 5\.6\.0/m), 'DATA-5XX: bounce report contains status field with our ext. smtp code');
                assert.ok(contents.match(/I never did and will like ascii art cats/), 'DATA-5XX: original upstream message available');
                outbound_context.exports.send_email = orig_send_email;
                done()
            };
            const testPlaybook = [
                { 'from': 'remote', 'line': '220 testing-smtp' },

                { 'from': 'haraka', 'test': line => line.match(/^EHLO /), 'description': 'Haraka should say EHLO' },
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

            util_hmailitem.playTestSmtpConversation(mock_hmail, mock_socket, done, testPlaybook, () => {})
        })
    })
})

