const SPF = require('../spf').SPF;
SPF.prototype.log_debug = function () {};  // noop, hush debug output

function _set_up (done) {
    this.SPF = new SPF();
    done();
}

exports.SPF = {
    setUp : _set_up,
    'new SPF': function (test) {
        test.expect(1);
        test.ok(this.SPF);
        test.done();
    },
    'constants' : function (test) {
        test.expect(8);
        test.equal(1, this.SPF.SPF_NONE);
        test.equal(2, this.SPF.SPF_PASS);
        test.equal(3, this.SPF.SPF_FAIL);
        test.equal(4, this.SPF.SPF_SOFTFAIL);
        test.equal(5, this.SPF.SPF_NEUTRAL);
        test.equal(6, this.SPF.SPF_TEMPERROR);
        test.equal(7, this.SPF.SPF_PERMERROR);
        test.equal(10, this.SPF.LIMIT);
        test.done();
    },
    'mod_redirect, true': function (test) {
        test.expect(2);
        const cb = function (err, rc) {
            test.equal(null, err);
            test.equal(1, rc);
            test.done();
        };
        this.SPF.been_there['example.com'] = true;
        this.SPF.mod_redirect('example.com', cb);
    },
    'mod_redirect, false': function (test) {
        test.expect(2);
        // var outer = this;
        const cb = function (err, rc) {
            test.equal(null, err);
            if (rc === 7) {
                // from time to time (this is the third time we've seen it,
                // American Express publishes an invalid SPF record which results
                // in a PERMERROR. Ignore it.
                console.error("aexp SPF record is broken again");
                test.equal(7, rc);
            }
            else {
                test.equal(3, rc);
            }
            test.done();
            // console.log(arguments);
        };
        this.SPF.count=0;
        this.SPF.ip='212.70.129.94';
        this.SPF.mail_from='fraud@aexp.com';
        this.SPF.mod_redirect('aexp.com', cb);
    },
};
