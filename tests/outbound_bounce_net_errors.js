'use strict';

// Testing bounce email contents related to errors occuring during SMTP dialog

// About running the tests:
// - Making a folder for queuing files
// - Creating a HMailItem instance using fixtures/util_hmailitem
// - Talk some STMP in the playbook
// - Test the outcome by replacing trigger functions with our testing code (outbound.send_email, HMailItem.temp_fail, ...)

require('../configfile').watch_files = false;
const fs          = require('fs');
const path        = require('path');
const util_hmailitem = require('./fixtures/util_hmailitem');
const TODOItem    = require('../outbound/todo');
const HMailItem    = require('../outbound/hmail');
const outbound    = require('../outbound');
const dns            = require('dns');
const constants      = require('haraka-constants');

const outbound_context = {
    TODOItem: TODOItem,
    exports: outbound
};

const queue_dir = path.resolve(__dirname, 'test-queue');

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
                const files = fs.readdirSync(queue_dir);
                files.forEach(function (file,index){
                    const curPath = path.resolve(queue_dir, file);
                    if (fs.lstatSync(curPath).isDirectory()) { // recurse
                        return done(new Error('did not expect an sub folder here ("' + curPath + '")! cancel'));
                    }
                });
                files.forEach(function (file,index){
                    const curPath = path.resolve(queue_dir, file);
                    fs.unlinkSync(curPath);
                });
                done();
            }
            else {
                done();
            }
        });
    },
    'test get-mx-deny triggers bounce(...)': function (test) {
        test.expect(2);

        util_hmailitem.newMockHMailItem(outbound_context, test, {}, function (mock_hmail){
            const orig_bounce = HMailItem.prototype.bounce;
            HMailItem.prototype.bounce = function (err, opts) {
                test.ok(true, 'get_mx=DENY: bounce function called');
                /* dsn_code: 550,
                 dsn_status: '5.1.2',
                 dsn_action: 'failed' */
                test.equal('5.1.2', this.todo.rcpt_to[0].dsn_status, 'get_mx=DENY dsn status = 5.1.2');
            };
            mock_hmail.domain = mock_hmail.todo.domain;
            HMailItem.prototype.get_mx_respond.apply(mock_hmail, [constants.deny, {}]);
            HMailItem.prototype.bounce = orig_bounce;
            test.done();
        });
    },
    'test get-mx-denysoft triggers temp_fail(...)': function (test) {
        test.expect(2);

        util_hmailitem.newMockHMailItem(outbound_context, test, {}, function (mock_hmail){
            const orig_temp_fail = HMailItem.prototype.temp_fail;
            HMailItem.prototype.temp_fail = function (err, opts) {
                test.ok(true, 'get_mx-DENYSOFT: temp_fail function called');
                /*dsn_code: 450,
                 dsn_status: '4.1.2',
                 dsn_action: 'delayed' */
                test.equal('4.1.2', this.todo.rcpt_to[0].dsn_status, 'get_mx=DENYSOFT dsn status = 4.1.2');
            };
            mock_hmail.domain = mock_hmail.todo.domain;
            HMailItem.prototype.get_mx_respond.apply(mock_hmail, [constants.denysoft, {}]);
            HMailItem.prototype.temp_fail = orig_temp_fail;
            test.done();
        });
    },
    'test found_mx({code:dns.NXDOMAIN}) triggers bounce(...)': function (test) {
        test.expect(2);

        util_hmailitem.newMockHMailItem(outbound_context, test, {}, function (mock_hmail){
            const orig_bounce = HMailItem.prototype.bounce;
            HMailItem.prototype.bounce = function (err, opts) {
                test.ok(true, 'found_mx({code: dns.NXDOMAIN}): bounce function called');
                test.equal('5.1.2', this.todo.rcpt_to[0].dsn_status, 'found_mx({code: dns.NXDOMAIN}: dsn status = 5.1.2');
            };
            HMailItem.prototype.found_mx.apply(mock_hmail, [{code: dns.NXDOMAIN}, {}]);
            HMailItem.prototype.bounce = orig_bounce;
            test.done();
        });
    },
    'test found_mx({code:\'NOMX\'}) triggers bounce(...)': function (test) {
        test.expect(2);

        util_hmailitem.newMockHMailItem(outbound_context, test, {}, function (mock_hmail){
            const orig_bounce = HMailItem.prototype.bounce;
            HMailItem.prototype.bounce = function (err, opts) {
                test.ok(true, 'found_mx({code: "NOMX"}): bounce function called');
                test.equal('5.1.2', this.todo.rcpt_to[0].dsn_status, 'found_mx({code: "NOMX"}: dsn status = 5.1.2');
            };
            HMailItem.prototype.found_mx.apply(mock_hmail, [{code: 'NOMX'}, {}]);
            HMailItem.prototype.bounce = orig_bounce;
            test.done();
        });
    },
    'test found_mx({code:\'SOME-OTHER-ERR\'}) triggers temp_fail(...)': function (test) {
        test.expect(2);

        util_hmailitem.newMockHMailItem(outbound_context, test, {}, function (mock_hmail){
            const orig_temp_fail = HMailItem.prototype.temp_fail;
            HMailItem.prototype.temp_fail = function (err, opts) {
                test.ok(true, 'found_mx({code: "SOME-OTHER-ERR"}): temp_fail function called');
                test.equal('4.1.0', this.todo.rcpt_to[0].dsn_status, 'found_mx({code: "SOME-OTHER-ERR"}: dsn status = 4.1.0');
            };
            HMailItem.prototype.found_mx.apply(mock_hmail, [{code: 'SOME-OTHER-ERR'}, {}]);
            HMailItem.prototype.temp_fail = orig_temp_fail;
            test.done();
        });
    },
    'test found_mx(null, [{priority:0,exchange:\'\'}]) triggers bounce(...)': function (test) {
        test.expect(2);


        util_hmailitem.newMockHMailItem(outbound_context, test, {}, function (mock_hmail){
            const orig_bounce = HMailItem.prototype.bounce;
            HMailItem.prototype.bounce = function (err, opts) {
                test.ok(true, 'found_mx(null, [{priority:0,exchange:""}]): bounce function called');
                test.equal('5.1.2', this.todo.rcpt_to[0].dsn_status, 'found_mx(null, [{priority:0,exchange:""}]): dsn status = 5.1.2');
            };
            HMailItem.prototype.found_mx.apply(mock_hmail, [null, [{priority:0,exchange:''}]]);
            HMailItem.prototype.bounce = orig_bounce;
            test.done();
        });
    },
    'test try_deliver while hmail.mxlist=[] triggers bounce(...)': function (test) {
        test.expect(2);

        util_hmailitem.newMockHMailItem(outbound_context, test, {}, function (mock_hmail){
            mock_hmail.mxlist = [];
            const orig_temp_fail = HMailItem.prototype.temp_fail;
            HMailItem.prototype.temp_fail = function (err, opts) {
                test.ok(true, 'try_deliver while hmail.mxlist=[]: temp_fail function called');
                test.equal('5.1.2', this.todo.rcpt_to[0].dsn_status, 'try_deliver while hmail.mxlist=[]: dsn status = 5.1.2');
            };
            HMailItem.prototype.try_deliver.apply(mock_hmail, []);
            HMailItem.prototype.temp_fail = orig_temp_fail;
            test.done();
        });
    },

}

