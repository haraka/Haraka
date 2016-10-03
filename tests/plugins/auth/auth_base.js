'use strict';

var fixtures     = require('haraka-test-fixtures');

var Connection   = fixtures.connection;

var utils        = require('../../../utils');

var _set_up = function (done) {

    this.plugin = new fixtures.plugin('auth/auth_base');

    this.plugin.get_plain_passwd = function (user, cb) {
        if (user === 'test') return cb('testpass');
        return cb(null);
    };

    this.connection = Connection.createConnection();
    this.connection.capabilities=null;

    done();
};

var _set_up_2 = function (done) {

    this.plugin = new fixtures.plugin('auth/auth_base');

    this.plugin.get_plain_passwd = function (user, connection, cb) {
        connection.notes.auth_custom_note = 'custom_note';
        if (user === 'test') return cb('testpass');
        return cb(null);
    };

    this.connection = Connection.createConnection();
    this.connection.capabilities=null;

    done();
};

exports.hook_capabilities = {
    setUp : _set_up,
    'no TLS, no auth': function (test) {
        var cb = function (rc, msg) {
            test.expect(3);
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            test.equal(null, this.connection.capabilities);
            test.done();
        }.bind(this);
        this.plugin.hook_capabilities(cb, this.connection);
    },
    'with TLS, auth is offered': function (test) {
        var cb = function (rc, msg) {
            test.expect(4);
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            test.ok(this.connection.capabilities.length);
            test.ok(this.connection.capabilities[0] === 'AUTH PLAIN LOGIN CRAM-MD5');
            // console.log(this.connection.capabilities);
            test.done();
        }.bind(this);
        this.connection.tls.enabled=true;
        this.connection.capabilities=[];
        this.plugin.hook_capabilities(cb, this.connection);
    },
};

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
};

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
};

exports.select_auth_method = {
    setUp : _set_up,
    'no auth methods yield no result': function (test) {
        var next = function (code) {
            test.equal(code, null);
            test.equal(false, this.connection.relaying);
            test.done();
        }.bind(this);
        this.plugin.select_auth_method(next, this.connection, 'AUTH PLAIN');
    },
    'invalid AUTH method, no result': function (test) {
        var next = function (code) {
            test.expect(2);
            test.equal(code, null);
            test.equal(false, this.connection.relaying);
            test.done();
        }.bind(this);
        this.connection.notes.allowed_auth_methods = ['PLAIN','LOGIN','CRAM-MD5'];
        this.plugin.select_auth_method(next, this.connection, 'AUTH FOO');
    },
    'valid AUTH method, valid attempt': function (test) {
        var next = function (code) {
            test.expect(2);
            test.equal(code, OK);
            test.ok(this.connection.relaying);
            test.done();
        }.bind(this);
        var method = 'PLAIN ' + utils.base64('discard\0test\0testpass');
        this.connection.notes.allowed_auth_methods = ['PLAIN','LOGIN'];
        this.plugin.select_auth_method(next, this.connection, method);
    },
};

exports.auth_plain = {
    setUp : _set_up,
    'params type=string returns OK': function (test) {
        var next = function () {
            test.expect(2);
            test.equal(arguments[0], OK);
            test.equal(false, this.connection.relaying);
            test.done();
        }.bind(this);
        this.plugin.auth_plain(next, this.connection, 'AUTH FOO');
    },
    'params type=empty array, returns OK': function (test) {
        var next = function () {
            test.expect(2);
            test.equal(arguments[0], OK);
            test.equal(false, this.connection.relaying);
            test.done();
        }.bind(this);
        this.plugin.auth_plain(next, this.connection, []);
    },
    'params type=array, successful auth': function (test) {
        var next = function () {
            test.expect(2);
            test.equal(arguments[0], OK);
            test.ok(this.connection.relaying);
            test.done();
        }.bind(this);
        var method = utils.base64('discard\0test\0testpass');
        this.plugin.auth_plain(next, this.connection, [method]);
    },
    'params type=with two line login': function (test) {
        var next = function () {
            test.expect(2);
            test.equal(this.connection.notes.auth_plain_asked_login, true);
            test.equal(arguments[0], OK);
            test.done();
        }.bind(this);
        this.plugin.auth_plain(next, this.connection, '');
    },
};

exports.check_user = {
    setUp : _set_up_2,
    'bad auth': function (test) {
        var next = function (code) {
            test.expect(3);
            test.equal(code, OK);
            test.equal(this.connection.relaying, false);
            test.equal(this.connection.notes.auth_custom_note, 'custom_note');
            test.done();
        }.bind(this);
        var credentials = ['matt','ttam'];
        this.plugin.check_user(next, this.connection, credentials, 'PLAIN');
    },
    'good auth': function (test) {
        var next = function (code) {
            test.expect(3);
            test.equal(code, OK);
            test.ok(this.connection.relaying);
            test.equal(this.connection.notes.auth_custom_note, 'custom_note');
            test.done();
        }.bind(this);
        var credentials = ['test','testpass'];
        this.plugin.check_user(next, this.connection, credentials, 'PLAIN');
    },
};

exports.hook_unrecognized_command = {
    setUp : _set_up,
    'AUTH type FOO': function (test) {
        var next = function (code) {
            test.expect(2);
            test.equal(code, null);
            test.equal(this.connection.relaying, false);
            test.done();
        }.bind(this);
        var params = ['AUTH','FOO'];
        this.connection.notes.allowed_auth_methods = ['PLAIN','LOGIN'];
        this.plugin.hook_unrecognized_command(next, this.connection, params);
    },
    'AUTH PLAIN': function (test) {
        var next = function (code) {
            test.expect(2);
            test.equal(code, OK);
            test.ok(this.connection.relaying);
            test.done();
        }.bind(this);
        var params = ['AUTH','PLAIN', utils.base64('discard\0test\0testpass')];
        this.connection.notes.allowed_auth_methods = ['PLAIN','LOGIN'];
        this.plugin.hook_unrecognized_command(next, this.connection, params);
    },
    'AUTH PLAIN, authenticating': function (test) {
        var next = function (code) {
            test.expect(2);
            test.equal(code, OK);
            test.ok(this.connection.relaying);
            test.done();
        }.bind(this);
        this.connection.notes.allowed_auth_methods = ['PLAIN','LOGIN'];
        this.connection.notes.authenticating=true;
        this.connection.notes.auth_method='PLAIN';
        this.plugin.hook_unrecognized_command(next, this.connection, [utils.base64('discard\0test\0testpass')]);
    },
};

exports.hexi = {
    setUp : _set_up,
    'hexi': function (test) {
        test.expect(2);
        test.equal(this.plugin.hexi(512), 200);
        test.equal(this.plugin.hexi(8), 8);
        test.done();
    },
};
