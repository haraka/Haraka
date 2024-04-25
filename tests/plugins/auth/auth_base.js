'use strict';
const assert = require('node:assert')

const { Address } = require('address-rfc2821');
const fixtures = require('haraka-test-fixtures');
const utils = require('haraka-utils');

const _set_up = (done) => {

    this.plugin = new fixtures.plugin('auth/auth_base');

    this.plugin.get_plain_passwd = (user, cb) => {
        if (user === 'test') return cb('testpass');
        return cb(null);
    };

    this.connection = fixtures.connection.createConnection();
    this.connection.capabilities=null;

    done();
}

const _set_up_2 = (done) => {

    this.plugin = new fixtures.plugin('auth/auth_base');

    this.plugin.get_plain_passwd = (user, connection, cb) => {
        connection.notes.auth_custom_note = 'custom_note';
        if (user === 'test') return cb('testpass');
        return cb(null);
    };

    this.connection = fixtures.connection.createConnection();
    this.connection.capabilities=null;

    done();
}

const _set_up_custom_pwcb_opts = (done) => {
    this.plugin = new fixtures.plugin('auth/auth_base');

    this.plugin.check_plain_passwd = (connection, user, passwd, pwok_cb) => {
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

describe('auth_base', () => {

    describe('hook_capabilities', () => {
        beforeEach(_set_up)

        it('no TLS, no auth', (done) => {
            this.plugin.hook_capabilities((rc, msg) => {
                assert.equal(undefined, rc);
                assert.equal(undefined, msg);
                assert.equal(null, this.connection.capabilities);
                done();
            }, this.connection);
        })

        it('with TLS, auth is offered', (done) => {
            this.connection.tls.enabled=true;
            this.connection.capabilities=[];
            this.plugin.hook_capabilities((rc, msg) => {
                assert.equal(undefined, rc);
                assert.equal(undefined, msg);
                assert.ok(this.connection.capabilities.length);
                assert.ok(this.connection.capabilities[0] === 'AUTH PLAIN LOGIN CRAM-MD5');
                // console.log(this.connection.capabilities);
                done();
            }, this.connection);
        })
    })

    describe('get_plain_passwd', () => {
        beforeEach(_set_up)

        it('get_plain_passwd, no result', (done) => {
            this.plugin.get_plain_passwd('user', pass => {
                assert.equal(pass, null);
                done();
            });
        })
        it('get_plain_passwd, test user', (done) => {
            this.plugin.get_plain_passwd('test', pass => {
                assert.equal(pass, 'testpass');
                done();
            });
        })
    })

    describe('check_plain_passwd', () => {
        beforeEach(_set_up)

        it('valid password', (done) => {
            this.plugin.check_plain_passwd(this.connection, 'test', 'testpass', pass => {
                assert.equal(pass, true);
                done();
            });
        })

        it('wrong password', (done) => {
            this.plugin.check_plain_passwd(this.connection, 'test', 'test1pass', pass => {
                assert.equal(pass, false);
                done();
            });
        })

        it('null password', (done) => {
            this.plugin.check_plain_passwd(this.connection, 'test', null, pass => {
                assert.equal(pass, false);
                done();
            });
        })
    })

    describe('select_auth_method', () => {
        beforeEach(_set_up)

        it('no auth methods yield no result', (done) => {
            this.plugin.select_auth_method((code) => {
                assert.equal(code, null);
                assert.equal(false, this.connection.relaying);
                done();
            }, this.connection, 'AUTH PLAIN');
        })

        it('invalid AUTH method, no result', (done) => {
            this.connection.notes.allowed_auth_methods = ['PLAIN','LOGIN','CRAM-MD5'];
            this.plugin.select_auth_method((code) => {
                assert.equal(code, null);
                assert.equal(false, this.connection.relaying);
                done();
            }, this.connection, 'AUTH FOO');
        })

        it('valid AUTH method, valid attempt', (done) => {
            const method = `PLAIN ${utils.base64('discard\0test\0testpass')}`;
            this.connection.notes.allowed_auth_methods = ['PLAIN','LOGIN'];
            this.plugin.select_auth_method((code) => {
                assert.equal(code, OK);
                assert.ok(this.connection.relaying);
                done();
            }, this.connection, method);
        })
    })

    describe('auth_plain', () => {
        beforeEach(_set_up)

        it('params type=string returns OK', (done) => {
            this.plugin.auth_plain((rc) => {
                assert.equal(rc, OK);
                assert.equal(false, this.connection.relaying);
                done();
            }, this.connection, 'AUTH FOO');
        })

        it('params type=empty array, returns OK', (done) => {
            this.plugin.auth_plain((rc) => {
                assert.equal(rc, OK);
                assert.equal(false, this.connection.relaying);
                done();
            }, this.connection, []);
        })

        it('params type=array, successful auth', (done) => {
            const method = utils.base64('discard\0test\0testpass');
            this.plugin.auth_plain((rc) => {
                assert.equal(rc, OK);
                assert.ok(this.connection.relaying);
                done();
            }, this.connection, [method]);
        })

        it('params type=with two line login', (done) => {
            this.plugin.auth_plain((rc) => {
                assert.equal(this.connection.notes.auth_plain_asked_login, true);
                assert.equal(rc, OK);
                done();
            }, this.connection, '');
        })
    })

    describe('check_user', () => {
        beforeEach(_set_up_2)

        it('bad auth', (done) => {
            const credentials = ['matt','ttam'];
            this.plugin.check_user((code) => {
                assert.equal(code, OK);
                assert.equal(this.connection.relaying, false);
                assert.equal(this.connection.notes.auth_custom_note, 'custom_note');
                done();
            }, this.connection, credentials, 'PLAIN');
        })

        it('good auth', (done) => {
            const credentials = ['test','testpass'];
            this.plugin.check_user((code) => {
                assert.equal(code, OK);
                assert.ok(this.connection.relaying);
                assert.equal(this.connection.notes.auth_custom_note, 'custom_note');
                done();
            }, this.connection, credentials, 'PLAIN');
        })
    })

    describe('check_user_custom_opts', () => {
        beforeEach(_set_up_custom_pwcb_opts)

        it('legacyok_nomessage', (done) => {
            this.plugin.check_user((code, msg) => {
                assert.equal(code, OK);
                assert.equal(this.connection.relaying, true);
                assert.deepEqual(this.connection.notes.resp_strings, [[ 235, '2.7.0 Authentication successful' ]]);
                done();
            }, this.connection, ['legacyok_nomessage', 'any'], 'PLAIN');
        })

        it('legacyfail_nomessage', (done) => {
            this.plugin.check_user((code, msg) => {
                assert.equal(code, OK);
                assert.equal(this.connection.relaying, false);
                assert.deepEqual(this.connection.notes.resp_strings, [ [ 535, '5.7.8 Authentication failed' ] ]);
                done();
            }, this.connection, ['legacyfail_nomessage', 'any'], 'PLAIN');
        })

        it('legacyok_message', (done) => {
            this.plugin.check_user((code, msg) => {
                assert.equal(code, OK);
                assert.equal(this.connection.relaying, true);
                assert.deepEqual(this.connection.notes.resp_strings, [[ 235, 'GREAT SUCCESS' ]]);
                done();
            }, this.connection, ['legacyok_message', 'any'], 'PLAIN');
        })

        it('legacyfail_message', (done) => {
            this.plugin.check_user((code, msg) => {
                assert.equal(code, OK);
                assert.equal(this.connection.relaying, false);
                assert.deepEqual(this.connection.notes.resp_strings, [[ 535, 'FAIL 123' ]]);
                done();
            }, this.connection, ['legacyfail_message', 'any'], 'PLAIN');
        })

        it('newok', (done) => {
            this.plugin.check_user((code, msg) => {
                assert.equal(code, OK);
                assert.equal(this.connection.relaying, true);
                assert.deepEqual(this.connection.notes.resp_strings, [[ 215, 'KOKOKO' ]]);
                done();
            }, this.connection, ['newok', 'any'], 'PLAIN');
        })

        it('newfail', (done) => {
            this.plugin.check_user((code, msg) => {
                assert.equal(code, OK);
                assert.equal(this.connection.relaying, false);
                assert.deepEqual(this.connection.notes.resp_strings, [[ 555, 'OHOHOH' ]]);
                done();
            }, this.connection, ['newfail', 'any'], 'PLAIN');
        })
    })

    describe('auth_notes_are_set', () => {
        beforeEach(_set_up_2)

        it('bad auth: no notes should be set', (done) => {
            const credentials = ['matt','ttam'];
            this.plugin.check_user((code) => {
                assert.equal(this.connection.notes.auth_user, undefined);
                assert.equal(this.connection.notes.auth_passwd, undefined);
                done();
            }, this.connection, credentials, 'PLAIN');
        })

        it('good auth: dont store password', (done) => {
            const creds = ['test','testpass'];
            this.plugin.blankout_password = true;
            this.plugin.check_user((code) => {
                assert.equal(this.connection.notes.auth_user, creds[0]);
                assert.equal(this.connection.notes.auth_passwd, undefined);
                done();
            }, this.connection, creds, 'PLAIN');
        })

        it('good auth: store password (default)', (done) => {
            const creds = ['test','testpass'];
            this.plugin.check_user((code) => {
                assert.equal(this.connection.notes.auth_user, creds[0]);
                assert.equal(this.connection.notes.auth_passwd, creds[1]);
                done();
            }, this.connection, creds, 'PLAIN');
        })
    })

    describe('hook_unrecognized_command', () => {
        beforeEach(_set_up)

        it('AUTH type FOO', (done) => {
            const params = ['AUTH','FOO'];
            this.connection.notes.allowed_auth_methods = ['PLAIN','LOGIN'];
            this.plugin.hook_unrecognized_command((code) => {
                assert.equal(code, null);
                assert.equal(this.connection.relaying, false);
                done();
            }, this.connection, params);
        })

        it('AUTH PLAIN', (done) => {
            const params = ['AUTH','PLAIN', utils.base64('discard\0test\0testpass')];
            this.connection.notes.allowed_auth_methods = ['PLAIN','LOGIN'];
            this.plugin.hook_unrecognized_command((code) => {
                assert.equal(code, OK);
                assert.ok(this.connection.relaying);
                done();
            }, this.connection, params);
        })

        it('AUTH PLAIN, authenticating', (done) => {
            this.connection.notes.allowed_auth_methods = ['PLAIN','LOGIN'];
            this.connection.notes.authenticating=true;
            this.connection.notes.auth_method='PLAIN';
            this.plugin.hook_unrecognized_command((code) => {
                assert.equal(code, OK);
                assert.ok(this.connection.relaying);
                done();
            }, this.connection, [utils.base64('discard\0test\0testpass')]);
        })
    })

    describe('auth_login', () => {
        beforeEach(_set_up)

        it('AUTH LOGIN', (done) => {
            const params = ['AUTH','LOGIN'];
            this.connection.notes.allowed_auth_methods = ['PLAIN','LOGIN'];
            this.plugin.hook_unrecognized_command((code) => {
                assert.equal(code, OK);
                assert.equal(this.connection.relaying, false);
                assert.equal(this.connection.notes.auth_login_asked_login , true);

                this.plugin.hook_unrecognized_command((code) => {
                    assert.equal(code, OK);
                    assert.equal(this.connection.notes.auth_login_userlogin, 'test');
                    assert.equal(this.connection.relaying, false);
                    this.plugin.hook_unrecognized_command((code) => {
                        assert.equal(code, OK);
                        assert.equal(this.connection.relaying, true);
                        done();
                    }, this.connection, [utils.base64('testpass')]);
                }, this.connection, [utils.base64('test')]);
            }, this.connection, params);
        })

        it('AUTH LOGIN <username>', (done) => {
            const params = ['AUTH','LOGIN', utils.base64('test')];
            this.connection.notes.allowed_auth_methods = ['PLAIN','LOGIN'];
            this.plugin.hook_unrecognized_command((code) => {
                assert.equal(code, OK);
                assert.equal(this.connection.relaying, false);
                assert.equal(this.connection.notes.auth_login_userlogin, 'test');
                assert.equal(this.connection.notes.auth_login_asked_login , true);

                this.plugin.hook_unrecognized_command((code2) => {
                    assert.equal(code2, OK);
                    assert.equal(this.connection.relaying, true);
                    done();
                }, this.connection, [utils.base64('testpass')]);
            }, this.connection, params);
        })

        it('AUTH LOGIN <username>, bad protocol', (done) => {

            const params = ['AUTH','LOGIN', utils.base64('test')];
            this.connection.notes.allowed_auth_methods = ['PLAIN','LOGIN'];
            this.plugin.hook_unrecognized_command((code) => {
                assert.equal(code, OK);
                assert.equal(this.connection.relaying, false);
                assert.equal(this.connection.notes.auth_login_userlogin, 'test');
                assert.equal(this.connection.notes.auth_login_asked_login , true);

                this.plugin.hook_unrecognized_command((code, msg) => {
                    assert.equal(code, DENYDISCONNECT);
                    assert.equal(msg, 'bad protocol');
                    assert.equal(this.connection.relaying, false);
                    done();
                }, this.connection, ['AUTH', 'LOGIN']);
            }, this.connection, params);
        })

        it('AUTH LOGIN, reauthentication', (done) => {
            const params = ['AUTH','LOGIN', utils.base64('test')];
            this.connection.notes.allowed_auth_methods = ['PLAIN','LOGIN'];
            this.plugin.hook_unrecognized_command((code) => {
                assert.equal(code, OK);
                assert.equal(this.connection.relaying, false);
                assert.equal(this.connection.notes.auth_login_userlogin, 'test');
                assert.equal(this.connection.notes.auth_login_asked_login , true);

                this.plugin.hook_unrecognized_command((code) => {
                    assert.equal(code, OK);
                    assert.equal(this.connection.relaying, true);
                    assert.equal(this.connection.notes.auth_login_userlogin, null);
                    assert.equal(this.connection.notes.auth_login_asked_login , false);

                    this.plugin.hook_unrecognized_command((code) => {
                        assert.equal(code, OK);
                        done();
                    }, this.connection, ['AUTH','LOGIN']);
                }, this.connection, [utils.base64('testpass')]);
            }, this.connection, params);
        })
    })

    describe('hexi', () => {
        beforeEach(_set_up)

        it('hexi', () => {
            assert.equal(this.plugin.hexi(512), 200);
            assert.equal(this.plugin.hexi(8), 8);
        })
    })

    describe('constrain_sender', () => {
        beforeEach(_set_up)

        it('constrain_sender, domain match', (done) => {
            this.mfrom = new Address('user@example.com')
            this.connection.results.add({name: 'auth'}, { user: 'user@example.com' })
            this.plugin.constrain_sender((resCode) => {
                    assert.equal(resCode, undefined)
                    done();
                },
                this.connection,
                [this.mfrom],
            )
        })

        it('constrain_sender, domain mismatch', (done) => {
            this.mfrom = new Address('user@example.net')
            this.connection.results.add({name: 'auth'}, { user: 'user@example.com' })
            this.plugin.constrain_sender((resCode, denyMsg) => {
                    assert.equal(resCode, DENY)
                    assert.ok(denyMsg)
                    done();
                },
                this.connection,
                [this.mfrom],
            )
        })
        it('constrain_sender, no domain', (done) => {
            this.mfrom = new Address('user@example.com')
            this.connection.results.add({name: 'auth'}, { user: 'user' })
            this.plugin.constrain_sender((resCode) => {
                    assert.equal(resCode, undefined)
                    done();
                },
                this.connection,
                [this.mfrom],
            )
        })
    })
})
