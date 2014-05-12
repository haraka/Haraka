
var SPF = require("../spf").SPF;


function _set_up(callback) {
    this.backup = {};

    this.SPF = new SPF();

    callback();
}
function _tear_down(callback) {
    callback();
}

exports.SPF = {
    setUp : _set_up,
    tearDown : _tear_down,
    'new SPF': function (test) {
        test.expect(1);
        test.ok(this);
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
        var cb = function (err, rc) {
            test.equal(null, err);
            test.equal(1, rc);
            test.done();
        };
        this.SPF.been_there['example.com'] = true;
        this.SPF.mod_redirect('example.com', cb);
    },
    'mod_redirect, false': function (test) {
        if (process.version !== 'v0.10.26') {
            test.expect(2);
            // var outer = this;
            var cb = function (err, rc) {
                test.equal(null, err);
                test.equal(3, rc);
                test.done();
                // console.log(arguments);
            };
            this.SPF.count=0;
            this.SPF.ip='212.70.129.94';
            this.SPF.mail_from='fraud@aexp.com';
            this.SPF.mod_redirect('aexp.com', cb);
        }
        else {
            test.expect(0);
            test.done();
        }
    },
};


