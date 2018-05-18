'use strict';

const fixtures     = require('haraka-test-fixtures');
const utils        = require('haraka-utils');

function _set_up (done) {

    this.plugin = new fixtures.plugin('auth/auth_base');

    this.plugin.get_plain_passwd = function (user, cb) {
        if (user === 'test') return cb('testpass');
        return cb(null);
    };

    this.connection = fixtures.connection.createConnection();
    this.connection.capabilities=null;

    done();
}

function _set_up_2 (done) {

    this.plugin = new fixtures.plugin('auth/auth_base');

    this.plugin.get_plain_passwd = function (user, connection, cb) {
        connection.notes.auth_custom_note = 'custom_note';
        if (user === 'test') return cb('testpass');
        return cb(null);
    };

    this.connection = fixtures.connection.createConnection();
    this.connection.capabilities=null;

    done();
}

function _set_up_custom_pwcb_opts (done) {
    this.plugin = new fixtures.plugin('auth/auth_base');

    this.plugin.check_plain_passwd = function (connection, user, passwd, pwok_cb) {
        switch (user) {
            case 'legacyok_nomessage':      return pwok_cb(true);
            case 'legacyfail_nomessage':    return pwok_cb(false);
            case 'legacyok_message':        return pwok_cb(true, 'GREAT SUCCESS');
            case 'legacyfail_message':      return pwok_cb(false, 'FAIL 123');
            case 'newok':                   return pwok_cb(true, {message: 'KOKOKO', code: 215});
            case 'newfail':                 return pwok_cb(false, {message: 'OHOHOH', code: 555});
            default: throw 'what?!';
        }
    };

    this.connection = fixtures.connection.createConnection();
    this.connection.capabilities=null;
    this.connection.notes.resp_strings = [];
    this.connection.respond = (code, msg, cb) => {
        this.connection.notes.resp_strings.push([code, msg]);
        return cb();
    }

    done();
}

exports.hook_capabilities = {
    setUp : _set_up,
    'no TLS, no auth': function (test) {
        this.plugin.hook_capabilities((rc, msg) => {
            test.expect(3);
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            test.equal(null, this.connection.capabilities);
            test.done();
        }, this.connection);
    },
    'with TLS, auth is offered': function (test) {
        this.connection.tls.enabled=true;
        this.connection.capabilities=[];
        this.plugin.hook_capabilities((rc, msg) => {
            test.expect(4);
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            test.ok(this.connection.capabilities.length);
            test.ok(this.connection.capabilities[0] === 'AUTH PLAIN LOGIN CRAM-MD5');
            // console.log(this.connection.capabilities);
            test.done();
        }, this.connection);
    },
}

exports.get_plain_passwd = {
    setUp : _set_up,
    'get_plain_passwd, no result': function (test) {
        this.plugin.get_plain_passwd('user', function (pass) {
            test.expect(1);
            test.equal(pass, null);
            test.done();
        });
    },
    'get_plain_passwd, test user': function (test) {
        this.plugin.get_plain_passwd('test', function (pass) {
            test.expect(1);
            test.equal(pass, 'testpass');
            test.done();
        });
    },
}

exports.check_plain_passwd = {
    setUp : _set_up,
    'valid password': function (test) {
        this.plugin.check_plain_passwd(this.connection, 'test', 'testpass', function (pass) {
            test.expect(1);
            test.equal(pass, true);
            test.done();
        });
    },
    'wrong password': function (test) {
        this.plugin.check_plain_passwd(this.connection, 'test', 'test1pass', function (pass) {
            test.expect(1);
            test.equal(pass, false);
            test.done();
        });
    },
    'null password': function (test) {
        this.plugin.check_plain_passwd(this.connection, 'test', null, function (pass) {
            test.expect(1);
            test.equal(pass, false);
            test.done();
        });
    },
}

exports.select_auth_method = {
    setUp : _set_up,
    'no auth methods yield no result': function (test) {
        this.plugin.select_auth_method((code) => {
            test.equal(code, null);
            test.equal(false, this.connection.relaying);
            test.done();
        }, this.connection, 'AUTH PLAIN');
    },
    'invalid AUTH method, no result': function (test) {
        this.connection.notes.allowed_auth_methods = ['PLAIN','LOGIN','CRAM-MD5'];
        this.plugin.select_auth_method((code) => {
            test.expect(2);
            test.equal(code, null);
            test.equal(false, this.connection.relaying);
            test.done();
        }, this.connection, 'AUTH FOO');
    },
    'valid AUTH method, valid attempt': function (test) {
        const method = `PLAIN ${utils.base64('discard\0test\0testpass')}`;
        this.connection.notes.allowed_auth_methods = ['PLAIN','LOGIN'];
        this.plugin.select_auth_method((code) => {
            test.expect(2);
            test.equal(code, OK);
            test.ok(this.connection.relaying);
            test.done();
        }, this.connection, method);
    },
}

exports.auth_plain = {
    setUp : _set_up,
    'params type=string returns OK': function (test) {
        test.expect(2);
        const next = function () {
            test.equal(arguments[0], OK);
            test.equal(false, this.connection.relaying);
            test.done();
        }.bind(this);
        this.plugin.auth_plain(next, this.connection, 'AUTH FOO');
    },
    'params type=empty array, returns OK': function (test) {
        const next = function () {
            test.expect(2);
            test.equal(arguments[0], OK);
            test.equal(false, this.connection.relaying);
            test.done();
        }.bind(this);
        this.plugin.auth_plain(next, this.connection, []);
    },
    'params type=array, successful auth': function (test) {
        test.expect(2);
        const method = utils.base64('discard\0test\0testpass');
        const next = function () {
            test.equal(arguments[0], OK);
            test.ok(this.connection.relaying);
            test.done();
        }.bind(this);
        this.plugin.auth_plain(next, this.connection, [method]);
    },
    'params type=with two line login': function (test) {
        const next = function () {
            test.expect(2);
            test.equal(this.connection.notes.auth_plain_asked_login, true);
            test.equal(arguments[0], OK);
            test.done();
        }.bind(this);
        this.plugin.auth_plain(next, this.connection, '');
    },
}

exports.check_user = {
    setUp : _set_up_2,
    'bad auth': function (test) {
        const credentials = ['matt','ttam'];
        this.plugin.check_user((code) => {
            test.expect(3);
            test.equal(code, OK);
            test.equal(this.connection.relaying, false);
            test.equal(this.connection.notes.auth_custom_note, 'custom_note');
            test.done();
        }, this.connection, credentials, 'PLAIN');
    },
    'good auth': function (test) {
        const credentials = ['test','testpass'];
        this.plugin.check_user((code) => {
            test.expect(3);
            test.equal(code, OK);
            test.ok(this.connection.relaying);
            test.equal(this.connection.notes.auth_custom_note, 'custom_note');
            test.done();
        }, this.connection, credentials, 'PLAIN');
    },
}

exports.check_user_custom_opts = {
    setUp: _set_up_custom_pwcb_opts,
    'legacyok_nomessage': function (test) {
        this.plugin.check_user((code, msg) => {
            test.equal(code, OK);
            test.equal(this.connection.relaying, true);
            test.deepEqual(this.connection.notes.resp_strings, [[ 235, '2.7.0 Authentication successful' ]]);
            test.done();
        }, this.connection, ['legacyok_nomessage', 'any'], 'PLAIN');
    },
    'legacyfail_nomessage': function (test) {
        this.plugin.check_user((code, msg) => {
            test.equal(code, OK);
            test.equal(this.connection.relaying, false);
            test.deepEqual(this.connection.notes.resp_strings, [ [ 535, '5.7.8 Authentication failed' ] ]);
            test.done();
        }, this.connection, ['legacyfail_nomessage', 'any'], 'PLAIN');
    },
    'legacyok_message': function (test) {
        this.plugin.check_user((code, msg) => {
            test.equal(code, OK);
            test.equal(this.connection.relaying, true);
            test.deepEqual(this.connection.notes.resp_strings, [[ 235, 'GREAT SUCCESS' ]]);
            test.done();
        }, this.connection, ['legacyok_message', 'any'], 'PLAIN');
    },
    'legacyfail_message': function (test) {
        this.plugin.check_user((code, msg) => {
            test.equal(code, OK);
            test.equal(this.connection.relaying, false);
            test.deepEqual(this.connection.notes.resp_strings, [[ 535, 'FAIL 123' ]]);
            test.done();
        }, this.connection, ['legacyfail_message', 'any'], 'PLAIN');
    },
    'newok': function (test) {
        this.plugin.check_user((code, msg) => {
            test.equal(code, OK);
            test.equal(this.connection.relaying, true);
            test.deepEqual(this.connection.notes.resp_strings, [[ 215, 'KOKOKO' ]]);
            test.done();
        }, this.connection, ['newok', 'any'], 'PLAIN');
    },
    'newfail': function (test) {
        this.plugin.check_user((code, msg) => {
            test.equal(code, OK);
            test.equal(this.connection.relaying, false);
            test.deepEqual(this.connection.notes.resp_strings, [[ 555, 'OHOHOH' ]]);
            test.done();
        }, this.connection, ['newfail', 'any'], 'PLAIN');
    },
}

exports.auth_notes_are_set = {
    setUp : _set_up_2,
    'bad auth: no notes should be set': function (test) {
        const credentials = ['matt','ttam'];
        this.plugin.check_user((code) => {
            test.equal(this.connection.notes.auth_user, undefined);
            test.equal(this.connection.notes.auth_passwd, undefined);
            test.done();
        }, this.connection, credentials, 'PLAIN');
    },
    'good auth: dont store password': function (test) {
        const creds = ['test','testpass'];
        this.plugin.blankout_password = true;
        this.plugin.check_user((code) => {
            test.equal(this.connection.notes.auth_user, creds[0]);
            test.equal(this.connection.notes.auth_passwd, undefined);
            test.done();
        }, this.connection, creds, 'PLAIN');
    },
    'good auth: store password (default)': function (test) {
        const creds = ['test','testpass'];
        this.plugin.check_user((code) => {
            test.equal(this.connection.notes.auth_user, creds[0]);
            test.equal(this.connection.notes.auth_passwd, creds[1]);
            test.done();
        }, this.connection, creds, 'PLAIN');
    },
}

exports.hook_unrecognized_command = {
    setUp : _set_up,
    'AUTH type FOO': function (test) {
        const params = ['AUTH','FOO'];
        this.connection.notes.allowed_auth_methods = ['PLAIN','LOGIN'];
        this.plugin.hook_unrecognized_command((code) => {
            test.expect(2);
            test.equal(code, null);
            test.equal(this.connection.relaying, false);
            test.done();
        }, this.connection, params);
    },
    'AUTH PLAIN': function (test) {
        const params = ['AUTH','PLAIN', utils.base64('discard\0test\0testpass')];
        this.connection.notes.allowed_auth_methods = ['PLAIN','LOGIN'];
        this.plugin.hook_unrecognized_command((code) => {
            test.expect(2);
            test.equal(code, OK);
            test.ok(this.connection.relaying);
            test.done();
        }, this.connection, params);
    },
    'AUTH PLAIN, authenticating': function (test) {
        this.connection.notes.allowed_auth_methods = ['PLAIN','LOGIN'];
        this.connection.notes.authenticating=true;
        this.connection.notes.auth_method='PLAIN';
        this.plugin.hook_unrecognized_command((code) => {
            test.expect(2);
            test.equal(code, OK);
            test.ok(this.connection.relaying);
            test.done();
        }, this.connection, [utils.base64('discard\0test\0testpass')]);
    }
}

exports.auth_login = {
    setUp : _set_up,
    'AUTH LOGIN': function (test) {
        test.expect(8);

        const next3 = function (code) {
            test.equal(code, OK);
            test.equal(this.connection.relaying, true);
            test.done();
        }.bind(this);

        const next2 = function (code) {
            test.equal(code, OK);
            test.equal(this.connection.notes.auth_login_userlogin, 'test');
            test.equal(this.connection.relaying, false);
            this.plugin.hook_unrecognized_command(next3, this.connection, [utils.base64('testpass')]);
        }.bind(this);

        const next = function (code) {
            test.equal(code, OK);
            test.equal(this.connection.relaying, false);
            test.equal(this.connection.notes.auth_login_asked_login , true);

            this.plugin.hook_unrecognized_command(next2, this.connection, [utils.base64('test')]);
        }.bind(this);

        const params = ['AUTH','LOGIN'];
        this.connection.notes.allowed_auth_methods = ['PLAIN','LOGIN'];
        this.plugin.hook_unrecognized_command(next, this.connection, params);
    },

    'AUTH LOGIN <username>': function (test) {
        test.expect(6);

        const next2 = function (code) {
            test.equal(code, OK);
            test.equal(this.connection.relaying, true);
            test.done();
        }.bind(this);

        const next = function (code) {
            test.equal(code, OK);
            test.equal(this.connection.relaying, false);
            test.equal(this.connection.notes.auth_login_userlogin, 'test');
            test.equal(this.connection.notes.auth_login_asked_login , true);

            this.plugin.hook_unrecognized_command(next2, this.connection, [utils.base64('testpass')]);
        }.bind(this);

        const params = ['AUTH','LOGIN', utils.base64('test')];
        this.connection.notes.allowed_auth_methods = ['PLAIN','LOGIN'];
        this.plugin.hook_unrecognized_command(next, this.connection, params);
    },

    'AUTH LOGIN <username>, bad protocol': function (test) {
        test.expect(7);

        const next2 = function (code, msg) {
            test.equal(code, DENYDISCONNECT);
            test.equal(msg, 'bad protocol');
            test.equal(this.connection.relaying, false);
            test.done();
        }.bind(this);

        const next = function (code) {
            test.equal(code, OK);
            test.equal(this.connection.relaying, false);
            test.equal(this.connection.notes.auth_login_userlogin, 'test');
            test.equal(this.connection.notes.auth_login_asked_login , true);

            this.plugin.hook_unrecognized_command(next2, this.connection, ['AUTH', 'LOGIN']);
        }.bind(this);

        const params = ['AUTH','LOGIN', utils.base64('test')];
        this.connection.notes.allowed_auth_methods = ['PLAIN','LOGIN'];
        this.plugin.hook_unrecognized_command(next, this.connection, params);
    },


    'AUTH LOGIN, reauthentication': function (test) {
        test.expect(9);

        const next3 = function (code) {
            test.equal(code, OK);

            test.done();
        };

        const next2 = function (code) {
            test.equal(code, OK);
            test.equal(this.connection.relaying, true);
            test.equal(this.connection.notes.auth_login_userlogin, null);
            test.equal(this.connection.notes.auth_login_asked_login , false);

            this.plugin.hook_unrecognized_command(next3, this.connection, ['AUTH','LOGIN']);
        }.bind(this);

        const next = function (code) {
            test.equal(code, OK);
            test.equal(this.connection.relaying, false);
            test.equal(this.connection.notes.auth_login_userlogin, 'test');
            test.equal(this.connection.notes.auth_login_asked_login , true);

            this.plugin.hook_unrecognized_command(next2, this.connection, [utils.base64('testpass')]);
        }.bind(this);

        const params = ['AUTH','LOGIN', utils.base64('test')];
        this.connection.notes.allowed_auth_methods = ['PLAIN','LOGIN'];
        this.plugin.hook_unrecognized_command(next, this.connection, params);
    }
}

exports.hexi = {
    setUp : _set_up,
    'hexi': function (test) {
        test.expect(2);
        test.equal(this.plugin.hexi(512), 200);
        test.equal(this.plugin.hexi(8), 8);
        test.done();
    },
}
