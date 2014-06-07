var stub             = require('../fixtures/stub'),
    Plugin           = require('../fixtures/stub_plugin'),
    Connection       = require('../fixtures/stub_connection'),
    constants        = require('../../constants'),
    Address          = require('../../address').Address,
    configfile       = require('../../configfile'),
    config           = require('../../config');
//  ResultStore      = require('../../result_store');

// huge hack here, but plugin tests need constants
constants.import(global);

var hmail = {
    "queue_time":1402091363826,
    "domain":"example.com",
    "rcpt_to":[{"original":"matt@example.com","user":"matt","host":"example.com"}],
    "mail_from":{"original":"<>",
    "user":null,
    "host":null},
    "notes":{},
    "uuid":"DFB28F2B-CC21-438B-864D-934E6860AB61.1",
};

function _set_up(callback) {
    this.backup = {};

    // needed for tests
    this.plugin = Plugin('rcpt_to.routes');
    this.plugin.config = config;
    this.plugin.register();
    this.connection = Connection.createConnection();
    this.connection.transaction = {
//      results: new ResultStore(this.connection),
        notes: {},
    };

    callback();
}

function _tear_down(callback) {
    callback();
}

exports.hook_rcpt = {
    setUp : _set_up,
    tearDown : _tear_down,
    'file based miss' : function (test) {
        test.expect(2);
        var cb = function (rc, msg) {
            test.equal(rc, undefined);
            test.equal(msg, undefined);
            test.done();
        }.bind(this);
        var addr = new Address('<matt@example.com>');
        this.plugin.hook_rcpt(cb, this.connection, [addr]);
    },
    'file based hit' : function (test) {
        test.expect(2);
        var cb = function (rc, msg) {
            test.equal(rc, OK);
            test.equal(msg, undefined);
            test.done();
        }.bind(this);
        this.plugin.route_list = {'matt@example.com': '192.168.1.1'};
        var addr = new Address('<matt@example.com>');
        this.plugin.hook_rcpt(cb, this.connection, [addr]);
    },
};

exports.get_mx = {
    setUp : _set_up,
    tearDown : _tear_down,
    'email address hit' : function (test) {
        test.expect(2);
        var cb = function (rc, mx) {
            test.equal(rc, OK);
            test.equal(mx, '192.168.1.1');
            test.done();
        }.bind(this);

        this.plugin.route_list = {'matt@example.com': '192.168.1.1'};
        var addr = new Address('<matt@example.com>');
        this.plugin.get_mx(cb, hmail, addr.host);
    },
    'email domain hit' : function (test) {
        test.expect(2);
        var cb = function (rc, mx) {
            test.equal(rc, OK);
            test.equal(mx, '192.168.1.2');
            test.done();
        }.bind(this);

        this.plugin.route_list = {'example.com': '192.168.1.2'};
        var addr = new Address('<matt@example.com>');
        this.plugin.get_mx(cb, hmail, addr.host);
    },
    'address preferred ' : function (test) {
        test.expect(2);
        var cb = function (rc, mx) {
            test.equal(rc, OK);
            test.equal(mx, '192.168.1.1');
            test.done();
        }.bind(this);

        this.plugin.route_list = {
            'matt@example.com': '192.168.1.1',
            'example.com': '192.168.1.2',
        };
        var addr = new Address('<matt@example.com>');
        this.plugin.get_mx(cb, hmail, addr.host);
    },
};
