var Address = require("../address").Address;

function _check(test, address, user, host) {
    test.expect(2);
    var a = new Address(address);
    test.equal(a.user, user);
    test.equal(a.host, host);
    test.done();
}

exports.good = {
    '<>': function (test) {
        _check(test, '<>', null, null);
    },
    '<postmaster>': function (test) {
        _check(test, '<postmaster>', 'postmaster', null);
    },
    '<foo@example.com>': function (test) {
        _check(test, '<foo@example.com>', 'foo', 'example.com');
    },
    '<"musa_ibrah@caramail.comandrea.luger"@wifo.ac.at>': function (test) {
        _check(test, '<"musa_ibrah@caramail.comandrea.luger"@wifo.ac.at>',
            'musa_ibrah@caramail.comandrea.luger', 'wifo.ac.at');
    },
    '<foo bar@example.com>': function (test) {
        _check(test, '<foo bar@example.com>', 'foo bar', 'example.com');
    },
    'foo@example.com': function (test) {
        _check(test, 'foo@example.com', 'foo', 'example.com');
    },
    '<foo@foo.x.example.com>': function (test) {
        _check(test, '<foo@foo.x.example.com>', 'foo', 'foo.x.example.com');
    },
    'foo@foo.x.example.com': function (test) {
        _check(test, 'foo@foo.x.example.com', 'foo', 'foo.x.example.com');
    }
};

exports.bad = {
    '<user@example.com#>': function (test) {
        test.expect(1);
        try {
            var address = new Address('<user@example.com#>');
        }
        catch (e) {
            test.ok(true);
        }
        test.done();
    },
    '<user@example.com>.': function (test) {
        test.expect(1);
        try {
            var address = new Address('<user@example.com.>');
        }
        catch (e) {
            test.ok(true);
        }
        test.done();
    }
};

exports.compile_re = {
    'compiles with no exceptions': function (test) {
        test.expect(1);
        var addr = require('../address');
        addr.compile_re();
        test.ok(addr);
        test.done();
    },
};

exports.isNull = {
    'positive <>': function (test) {
        test.expect(1);
        test.ok(new Address('<>').isNull());
        test.done();
    },
    'negative': function (test) {
        test.expect(1);
        test.ok(!new Address('<matt@example.com>').isNull());
        test.done();
    },
};
