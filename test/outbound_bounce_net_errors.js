'use strict';

// Testing bounce email contents related to errors occuring during SMTP dialog

// About running the tests:
// - Making a folder for queuing files
// - Creating a HMailItem instance using fixtures/util_hmailitem
// - Talk some STMP in the playbook
// - Test the outcome by replacing trigger functions with our testing code (outbound.send_email, HMailItem.temp_fail, ...)

const assert = require('node:assert')
const dns    = require('node:dns');
const fs     = require('node:fs');
const path   = require('node:path');

const constants   = require('haraka-constants');
const util_hmailitem = require('./fixtures/util_hmailitem');
const TODOItem       = require('../outbound/todo');
const HMailItem      = require('../outbound/hmail');
const outbound       = require('../outbound');

const outbound_context = {
    TODOItem,
    exports: outbound
}

const queue_dir = path.resolve(__dirname, 'test-queue');

describe('outbound_bounce_net_errors', () => {
    beforeEach((done) => {
        fs.exists(queue_dir, exists => {
            if (exists) {
                done();
            }
            else {
                fs.mkdir(queue_dir, done)
            }
        });
    })

    afterEach((done) => {
        fs.exists(queue_dir, (exists) => {
            if (exists) {
                for (const file of fs.readdirSync(queue_dir)) {
                    const curPath = path.resolve(queue_dir, file);
                    if (fs.lstatSync(curPath).isDirectory()) {
                        console.error(`did not expect an sub folder here ("${curPath}")! cancel`)
                    }
                    fs.unlinkSync(curPath);
                }
            }
            done()
        })
    })

    it('test get-mx-deny triggers bounce(...)', (done) => {
        util_hmailitem.newMockHMailItem(outbound_context, done, {}, mock_hmail => {
            const orig_bounce = HMailItem.prototype.bounce;
            HMailItem.prototype.bounce = function (err, opts) {
                assert.ok(true, 'get_mx=DENY: bounce function called');
                /* dsn_code: 550,
                 dsn_status: '5.1.2',
                 dsn_action: 'failed' */
                assert.equal('5.1.2', this.todo.rcpt_to[0].dsn_status, 'get_mx=DENY dsn status = 5.1.2');
                done()
            };
            mock_hmail.domain = mock_hmail.todo.domain;
            HMailItem.prototype.get_mx_respond.apply(mock_hmail, [constants.deny, {}]);
            HMailItem.prototype.bounce = orig_bounce;
        })
    })

    it('test get-mx-denysoft triggers temp_fail(...)', (done) => {
        util_hmailitem.newMockHMailItem(outbound_context, done, {}, mock_hmail => {
            const orig_temp_fail = HMailItem.prototype.temp_fail;
            HMailItem.prototype.temp_fail = function (err, opts) {
                assert.ok(true, 'get_mx-DENYSOFT: temp_fail function called');
                /*dsn_code: 450,
                 dsn_status: '4.1.2',
                 dsn_action: 'delayed' */
                assert.equal('4.1.2', this.todo.rcpt_to[0].dsn_status, 'get_mx=DENYSOFT dsn status = 4.1.2');
                done()
            };
            mock_hmail.domain = mock_hmail.todo.domain;
            HMailItem.prototype.get_mx_respond.apply(mock_hmail, [constants.denysoft, {}]);
            HMailItem.prototype.temp_fail = orig_temp_fail;
        })
    })

    it('test found_mx({code:dns.NXDOMAIN}) triggers bounce(...)', (done) => {
        util_hmailitem.newMockHMailItem(outbound_context, done, {}, mock_hmail => {
            const orig_bounce = HMailItem.prototype.bounce;
            HMailItem.prototype.bounce = function (err, opts) {
                assert.ok(true, 'get_mx_error({code: dns.NXDOMAIN}): bounce function called');
                assert.equal('5.1.2', this.todo.rcpt_to[0].dsn_status, 'get_mx_error({code: dns.NXDOMAIN}: dsn status = 5.1.2');
                done()
            };
            HMailItem.prototype.get_mx_error.apply(mock_hmail, [{code: dns.NXDOMAIN}]);
            HMailItem.prototype.bounce = orig_bounce;
        });
    })

    it('test get_mx_error({code:\'SOME-OTHER-ERR\'}) triggers temp_fail(...)', (done) => {
        util_hmailitem.newMockHMailItem(outbound_context, done, {}, mock_hmail => {
            const orig_temp_fail = HMailItem.prototype.temp_fail;
            HMailItem.prototype.temp_fail = function (err, opts) {
                assert.ok(true, 'get_mx_error({code: "SOME-OTHER-ERR"}): temp_fail function called');
                assert.equal('4.1.0', this.todo.rcpt_to[0].dsn_status, 'get_mx_error({code: "SOME-OTHER-ERR"}: dsn status = 4.1.0');
                done()
            };
            HMailItem.prototype.get_mx_error.apply(mock_hmail, [{code: 'SOME-OTHER-ERR'}, {}]);
            HMailItem.prototype.temp_fail = orig_temp_fail;
        });
    })

    it('test found_mx(null, [{priority:0,exchange:\'\'}]) triggers bounce(...)', (done) => {
        util_hmailitem.newMockHMailItem(outbound_context, done, {}, mock_hmail => {
            const orig_bounce = HMailItem.prototype.bounce;
            HMailItem.prototype.bounce = function (err, opts) {
                assert.ok(true, 'found_mx(null, [{priority:0,exchange:""}]): bounce function called');
                assert.equal('5.1.2', this.todo.rcpt_to[0].dsn_status, 'found_mx(null, [{priority:0,exchange:""}]): dsn status = 5.1.2');
                done()
            };
            HMailItem.prototype.found_mx.apply(mock_hmail, [[{priority:0,exchange:''}]]);
            HMailItem.prototype.bounce = orig_bounce;
        });
    })

    it('test try_deliver while hmail.mxlist=[] triggers bounce(...)', (done) => {
        util_hmailitem.newMockHMailItem(outbound_context, done, {}, mock_hmail => {
            mock_hmail.mxlist = [];
            const orig_temp_fail = HMailItem.prototype.temp_fail;
            HMailItem.prototype.temp_fail = function (err, opts) {
                assert.ok(true, 'try_deliver while hmail.mxlist=[]: temp_fail function called');
                assert.equal('5.1.2', this.todo.rcpt_to[0].dsn_status, 'try_deliver while hmail.mxlist=[]: dsn status = 5.1.2');
                done()
            };
            HMailItem.prototype.try_deliver.apply(mock_hmail, []);
            HMailItem.prototype.temp_fail = orig_temp_fail;
        });
    })
})
