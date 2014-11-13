var stub      = require('./fixtures/stub'),
    constants = require('./../constants'),
    Logger    = require('./fixtures/stub_logger'),
    utils     = require('./../utils');

// huge hack here, but plugin tests need constants
constants.import(global);

function _set_up(callback) {
    this.backup = {};
    callback();
}

function _tear_down(callback) {
    callback();
}

exports.utils = {
    setUp : _set_up,
    tearDown : _tear_down,
    'plain ascii should not be encoded' : function (test) {
        test.expect(1);
        test.equals(utils.encode_qp("quoted printable"), "quoted printable");
        test.done();
    },
    '8-bit chars should be encoded' : function (test) {
        test.expect(1);
        test.equals(
            utils.encode_qp(
                "v\xe5re kj\xe6re norske tegn b\xf8r \xe6res"
            ),
            "v=E5re kj=E6re norske tegn b=F8r =E6res");
        test.done();
    },
    'trailing space should be encoded' : function (test) {
        test.expect(5);
        test.equals(utils.encode_qp("  "), "=20=20");
        test.equals(utils.encode_qp("\tt\t"), "\tt=09");
        test.equals(
            utils.encode_qp("test  \ntest\n\t \t \n"),
            "test=20=20\ntest\n=09=20=09=20\n"
        );
        test.equals(utils.encode_qp("foo \t "), "foo=20=09=20");
        test.equals(utils.encode_qp("foo\t \n \t"), "foo=09=20\n=20=09");
        test.done();
    },
    'trailing space should be decoded unless newline' : function (test) {
        test.expect(2);
        test.deepEqual(utils.decode_qp("foo  "), new Buffer("foo  "));
        test.deepEqual(utils.decode_qp("foo  \n"), new Buffer("foo\n"));
        test.done();
    },
    '"=" is special and should be decoded' : function (test) {
        test.expect(2);
        test.equals(utils.encode_qp("=30\n"), "=3D30\n");
        test.equals(utils.encode_qp("\0\xff0"), "=00=FF0");
        test.done();
    },
    'Very long lines should be broken' : function (test) {
        test.expect(1);
        test.equals(utils.encode_qp("The Quoted-Printable encoding is intended to represent data that largly consists of octets that correspond to printable characters in the ASCII character set."), "The Quoted-Printable encoding is intended to represent data that largly con=\nsists of octets that correspond to printable characters in the ASCII charac=\nter set.");
        test.done();
    },
    'multiple long lines' : function (test) {
        test.expect(1);
        test.equals(utils.encode_qp("College football is a game which would be much more interesting if the faculty played instead of the students, and even more interesting if the\ntrustees played.  There would be a great increase in broken arms, legs, and necks, and simultaneously an appreciable diminution in the loss to humanity. -- H. L. Mencken"), "College football is a game which would be much more interesting if the facu=\nlty played instead of the students, and even more interesting if the\ntrustees played.  There would be a great increase in broken arms, legs, and=\n necks, and simultaneously an appreciable diminution in the loss to humanit=\ny. -- H. L. Mencken");
        test.done();
    },
    "Don't break a line that's near but not over 76 chars" : function (test) {
        var buffer = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" +
                     "xxxxxxxxxxxxxxxxxx";
        test.equals(utils.encode_qp(buffer+"123"), buffer+"123");
        test.equals(utils.encode_qp(buffer+"1234"), buffer+"1234");
        test.equals(utils.encode_qp(buffer+"12345"), buffer+"12345");
        test.equals(utils.encode_qp(buffer+"123456"), buffer+"123456");
        test.equals(utils.encode_qp(buffer+"1234567"), buffer+"12345=\n67");
        test.equals(utils.encode_qp(buffer+"123456="), buffer+"12345=\n6=3D");
        test.equals(utils.encode_qp(buffer+"123\n"), buffer+"123\n");
        test.equals(utils.encode_qp(buffer+"1234\n"), buffer+"1234\n");
        test.equals(utils.encode_qp(buffer+"12345\n"), buffer+"12345\n");
        test.equals(utils.encode_qp(buffer+"123456\n"), buffer+"123456\n");
        test.equals(utils.encode_qp(buffer+"1234567\n"), buffer+"12345=\n67\n");
        test.equals(
            utils.encode_qp(buffer+"123456=\n"), buffer+"12345=\n6=3D\n"
        );
        test.done();
    },
    'Not allowed to break =XX escapes using soft line break' : function (test) {
        test.expect(10);
        var buffer = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" +
                     "xxxxxxxxxxxxxxxxxx";
        test.equals(
            utils.encode_qp(buffer+"===xxxxx"), buffer+"=3D=\n=3D=3Dxxxxx"
        );
        test.equals(
            utils.encode_qp(buffer+"1===xxxx"), buffer+"1=3D=\n=3D=3Dxxxx"
        );
        test.equals(
            utils.encode_qp(buffer+"12===xxx"), buffer+"12=3D=\n=3D=3Dxxx"
        );
        test.equals(
            utils.encode_qp(buffer+"123===xx"), buffer+"123=\n=3D=3D=3Dxx"
        );
        test.equals(
            utils.encode_qp(buffer+"1234===x"), buffer+"1234=\n=3D=3D=3Dx"
        );
        test.equals(utils.encode_qp(buffer+"12=\n"), buffer+"12=3D\n");
        test.equals(utils.encode_qp(buffer+"123=\n"), buffer+"123=\n=3D\n");
        test.equals(utils.encode_qp(buffer+"1234=\n"), buffer+"1234=\n=3D\n");
        test.equals(utils.encode_qp(buffer+"12345=\n"), buffer+"12345=\n=3D\n");
        test.equals(
          utils.encode_qp(buffer+"123456=\n"), buffer+"12345=\n6=3D\n"
        );
        test.done();
    },
    'some extra special cases we have had problems with' : function (test) {
        test.expect(2);
        var buffer = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" +
                     "xxxxxxxxxxxxxxxxxx";
        test.equals(utils.encode_qp(buffer+"12=x=x"), buffer+"12=3D=\nx=3Dx");
        test.equals(
            utils.encode_qp(buffer+"12345"+buffer+"12345"+buffer+"123456\n"),
            buffer+"12345=\n"+buffer+"12345=\n"+buffer+"123456\n"
        );
        test.done();
    },
    'regression test 01' : function (test) {
        test.expect(1);
        test.deepEqual(
            utils.decode_qp("foo  \n\nfoo =\n\nfoo=20\n\n"),
            new Buffer("foo\n\nfoo \nfoo \n\n")
        );
        test.done();
    },
    'regression test 01 with CRLF' : function (test) {
        test.expect(1);
        test.deepEqual(
            utils.decode_qp("foo  \r\n\r\nfoo =\r\n\r\nfoo=20\r\n\r\n"),
            new Buffer("foo\n\nfoo \nfoo \n\n")
        );
        test.done();
    },
    'regression test 02' : function (test) {
        test.expect(1);
        test.deepEqual(
            utils.decode_qp("foo = \t\x20\nbar\t\x20\n"),
            new Buffer("foo bar\n")
        );
        test.done();
    },
    'regression test 02 with CRLF' : function (test) {
        test.expect(1);
        test.deepEqual(
            utils.decode_qp("foo = \t\x20\r\nbar\t\x20\r\n"),
            new Buffer("foo bar\n")
        );
        test.done();
    },
    'regression test 03' : function (test) {
        test.expect(1);
        test.deepEqual(
            utils.decode_qp("foo = \t\x20\n"), new Buffer("foo ")
        );
        test.done();
    },
    'regression test 03 with CRLF' : function (test) {
        test.expect(1);
        test.deepEqual(
            utils.decode_qp("foo = \t\x20\r\n"), new Buffer("foo ")
        );
        test.done();
    },
    'regression test 04 from CRLF to LF' : function (test) {
        test.expect(1);
        test.deepEqual(
            utils.decode_qp("foo = \t\x20y\r\n"), new Buffer("foo = \t\x20y\n")
        );
        test.done();
    },
    'regression test 05 should be the same' : function (test) {
        test.expect(1);
        test.deepEqual(
            utils.decode_qp("foo =xy\n"), new Buffer("foo =xy\n")
        );
        test.done();
    },
    'spin encode_qp()' : function (test) {
        var spin = 10000;
        test.expect(spin);
        for (var i = 0; i < spin; i++) {
            test.equals(
                utils.encode_qp("quoted printable"), "quoted printable"
            );
        }
        test.done();
    }
};

exports.valid_regexes = {
    setUp : _set_up,
    tearDown : _tear_down,
    'two valid': function (test) {
        var re_list = ['.*\.exam.ple','.*\.example.com'];
        test.expect(1);
        test.deepEqual(re_list, utils.valid_regexes(re_list));
        test.done();
    },
    'one valid, one invalid': function (test) {
        var re_list = ['*\.exam.ple','.*\.example.com'];
        test.expect(1);
        test.deepEqual(['.*\.example.com'], utils.valid_regexes(re_list));
        test.done();
    },
    'one valid, two invalid': function (test) {
        var re_list = ['[', '*\.exam.ple','.*\.example.com'];
        test.expect(1);
        test.deepEqual(['.*\.example.com'], utils.valid_regexes(re_list));
        test.done();
    },
};

exports.base64 = {
    setUp : _set_up,
    tearDown : _tear_down,
    'base64': function (test) {
        test.expect(1);
        test.equal(utils.base64("matt the tester"), 'bWF0dCB0aGUgdGVzdGVy');
        test.done();
    },
    'unbase64': function (test) {
        test.expect(1);
        test.equal(utils.unbase64("bWF0dCB0aGUgdGVzdGVy"), 'matt the tester');
        test.done();
    }
};
