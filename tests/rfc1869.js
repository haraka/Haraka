var parse = require("../rfc1869").parse;

function _check(test, line, expected) {
    test.expect(1 + expected.length);
    var match = /^(MAIL|RCPT)\s+(.*)$/.exec(line);
    var parsed = parse(match[1].toLowerCase(), match[2]);
    test.equal(parsed.length, expected.length);
    for (var x = 0; x < expected.length; x++) {
        test.equal(parsed[x], expected[x]);
    }
    test.done();
}

exports.basic = {
    'MAIL FROM:<>': function (test) {
        _check(test, 'MAIL FROM:<>', ['<>']);
    },
    'MAIL FROM:': function (test) {
        _check(test, 'MAIL FROM:', ['<>']);
    },
    'MAIL FROM:<postmaster>': function (test) {
        _check(test, 'MAIL FROM:<postmaster>', ['<postmaster>']);
    },
    'MAIL FROM:user': function (test) {
        _check(test, 'MAIL FROM:user', ['user']);
    },
    'MAIL FROM:user size=1234': function (test) {
        _check(test, 'MAIL FROM:user size=1234', ['user', 'size=1234']);
    },
    'MAIL FROM:user@domain size=1234': function (test) {
        _check(test, 'MAIL FROM:user@domain size=1234',
            ['user@domain', 'size=1234']);
    },
    'MAIL FROM:<user@domain> size=1234': function (test) {
        _check(test, 'MAIL FROM:<user@domain> size=1234',
            ['<user@domain>', 'size=1234']);
    },
    'MAIL FROM:<user@domain> somekey': function (test) {
        _check(test, 'MAIL FROM:<user@domain> somekey',
            ['<user@domain>', 'somekey']);
    },
    'MAIL FROM:<user@domain> somekey other=foo': function (test) {
        _check(test, 'MAIL FROM:<user@domain> somekey other=foo',
            ['<user@domain>', 'somekey', 'other=foo']);
    },
    'RCPT TO ugly': function (test) {
        _check(test, 'RCPT TO: 0@mailblog.biz 0=9 1=9',
            ['<0@mailblog.biz>', '0=9', '1=9']);
    },
    'RCPT TO:<r86x-ray@emailitin.com> state=1': function (test) {
        _check(test, 'RCPT TO:<r86x-ray@emailitin.com> state=1',
            ['<r86x-ray@emailitin.com>', 'state=1']);
    },
    'RCPT TO:<user=name@domain.com> foo=bar': function (test) {
        _check(test, 'RCPT TO:<user=name@domain.com> foo=bar',
            ['<user=name@domain.com>', 'foo=bar']);
    }, 
};
