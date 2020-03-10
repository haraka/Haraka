const SPF = require('../spf').SPF;
SPF.prototype.log_debug = () => {};  // noop, hush debug output

function _set_up (done) {
    this.SPF = new SPF();
    done();
}

exports.SPF = {
    setUp : _set_up,
    'new SPF' (test) {
        test.expect(1);
        test.ok(this.SPF);
        test.done();
    },
    'constants' (test) {
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
    'mod_redirect, true' (test) {
        test.expect(2);
        this.SPF.been_there['example.com'] = true;
        this.SPF.mod_redirect('example.com', (err, rc) => {
            test.equal(null, err);
            test.equal(1, rc);
            test.done();
        });
    },
    'mod_redirect, false' (test) {
        test.expect(2);
        this.SPF.count=0;
        this.SPF.ip='212.70.129.94';
        this.SPF.mail_from='fraud@aexp.com';
        this.SPF.mod_redirect('aexp.com', (err, rc) => {
            test.equal(null, err);
            switch (rc) {
                case 7:
                    // from time to time (this is the third time we've seen it,
                    // American Express publishes an invalid SPF record which results
                    // in a PERMERROR. Ignore it.
                    test.equal(rc, 7, "aexp SPF record is broken again");
                    break;
                case 6:
                    test.equal(rc, 6, "temporary (likely DNS timeout) error");
                    break;
                default:
                    test.equal(rc, 3);
            }
            test.done();
        });
    },
    'check_host, gmail.com, fail' (test) {
        test.expect(2);
        this.SPF.count=0;
        this.SPF.check_host('212.70.129.94', 'gmail.com', 'haraka.mail@gmail.com', (err, rc) => {
            test.equal(null, err);
            switch (rc) {
                case 1:
                    test.equal(rc, 1, "none");
                    console.log('Why do DNS lookup fail to find gmail SPF record on GitHub Actions?');
                    break;
                case 3:
                    test.equal(rc, 3, "fail");
                    break;
                case 4:
                    test.equal(rc, 4, "soft fail");
                    break;
                case 7:
                    test.equal(rc, 7, "perm error");
                    break;
                default:
                    test.equal(rc, 4)
            }
            test.done();
        });
    },
    'valid_ip, true' (test) {
        test.expect(1);
        test.equal(this.SPF.valid_ip(':212.70.129.94'), true);
        test.done();
    },
    'valid_ip, false' (test) {
        test.expect(1);
        test.equal(this.SPF.valid_ip(':212.70.d.94'), false);
        test.done();
    }

}
