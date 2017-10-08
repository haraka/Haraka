'use strict';

const Hmail = require('../../outbound/hmail');


exports.hmail = {
    setUp: function (done) {
        done();
    },
    'HMailItem': function (test) {
        this.hmail = new Hmail('1507492322654_1507492322654_0_43707_Ok94C9_1_haraka', 'tests/test-queue/1507492322654_1507492322654_0_43707_Ok94C9_1_haraka', {});
        test.expect(1);
        this.hmail.on('error', (e) => {
            console.error(e);
            test.ok(e);
            test.done();
        })
        this.hmail.on('ready', () => {
            // console.log(typeof this.hmail);
            // console.log(this.hmail);
            test.ok(this.hmail)
            test.done();
        })
    }
}
