var stub         = require('../../fixtures/stub'),
    Plugin       = require('../../fixtures/stub_plugin'),
    Connection   = require('../../fixtures/stub_connection'),
    configfile   = require('../../../configfile'),
    config       = require('../../../config'),
    constants    = require('../../../constants'),
    ResultStore  = require('../../../result_store'),
    utils        = require('../../../utils');

constants.import(global);

function _set_up(callback) {
    this.backup = {};

    // needed for tests
    this.plugin = Plugin('auth/auth_base');
    this.plugin.config = config;
    this.plugin.get_plain_passwd = function (user, cb) {
        if (user === 'test') return cb('testpass');
        return cb(null);
    };

    // stub out functions
    this.connection = Connection.createConnection();

    this.connection.results = new ResultStore(this.connection);
    this.connection.notes = {};
    this.connection.capabilities=null;

    callback();
}

function _tear_down(callback) {
    callback();
}

exports.hook_capabilities = {
    setUp : _set_up,
    tearDown : _tear_down,
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
        this.connection.using_tls=true;
        this.connection.capabilities=[];
        this.plugin.hook_capabilities(cb, this.connection);
    },
};

exports.get_plain_passwd = {
    setUp : _set_up,
    tearDown : _tear_down,
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
    tearDown : _tear_down,
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
    tearDown : _tear_down,
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
    tearDown : _tear_down,
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
};

exports.check_user = {
    setUp : _set_up,
    tearDown : _tear_down,
    'bad auth': function (test) {
        var next = function (code) {
            test.expect(2);
            test.equal(code, OK);
            test.equal(this.connection.relaying, false);
            test.done();
        }.bind(this);
        var credentials = ['matt','ttam'];
        this.plugin.check_user(next, this.connection, credentials, 'PLAIN');
    },
    'good auth': function (test) {
        var next = function (code) {
            test.expect(2);
            test.equal(code, OK);
            test.ok(this.connection.relaying);
            test.done();
        }.bind(this);
        var credentials = ['test','testpass'];
        this.plugin.check_user(next, this.connection, credentials, 'PLAIN');
    },
};

exports.hook_unrecognized_command = {
    setUp : _set_up,
    tearDown : _tear_down,
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
    tearDown : _tear_down,
    'hexi': function (test) {
        test.expect(2);
        test.equal(this.plugin.hexi(512), 200);
        test.equal(this.plugin.hexi(8), 8);
        test.done();
    },
};
