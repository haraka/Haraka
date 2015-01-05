'use strict';

var Plugin        = require('../fixtures/stub_plugin');
var Connection    = require('../fixtures/stub_connection');
var Address       = require('../../address').Address;
var config        = require('../../config');
var ResultStore   = require('../../result_store');

var hmail = {
    todo: {
        "queue_time":1402091363826,
        "domain":"example.com",
        "rcpt_to":[ new Address('matt@example.com') ],
        "mail_from": new Address('<>'),
        "notes": {
            authentication_results: [ 'spf=pass smtp.mailfrom=example.net' ],
            spf_mail_result: 'Pass',
            local_sender: true,
        },
        "uuid":"DFB28F2B-CC21-438B-864D-934E6860AB61.1",
    },
};

var _set_up_file = function (done) {

    this.plugin = new Plugin('rcpt_to.routes');
    this.plugin.config = config;
    this.plugin.register();
    this.connection = Connection.createConnection();
    this.connection.transaction = {
        results: new ResultStore(this.connection),
        notes: {},
    };

    done();
};

var _set_up_redis = function (done) {

    this.plugin = new Plugin('rcpt_to.routes');
    this.plugin.config = config;
    this.plugin.register();
    this.connection = Connection.createConnection();
    this.connection.transaction = {
        results: new ResultStore(this.connection),
        notes: {},
    };

    this.plugin.redis_ping(done);
};

var _tear_down_redis = function (done) {
    this.plugin.delete_route('matt@example.com', done);
};

exports.rcpt_file = {
    setUp : _set_up_file,
    'miss' : function (test) {
        test.expect(2);
        var cb = function (rc, msg) {
            test.equal(rc, undefined);
            test.equal(msg, undefined);
            test.done();
        }.bind(this);
        this.plugin.rcpt(cb, this.connection,
            [ new Address('<matt@example.com>') ]);
    },
    'hit' : function (test) {
        test.expect(2);
        var cb = function (rc, msg) {
            test.equal(rc, OK);
            test.equal(msg, undefined);
            test.done();
        }.bind(this);
        this.plugin.route_list = {'matt@example.com': '192.168.1.1'};
        this.plugin.rcpt(cb, this.connection,
            [new Address('<matt@example.com>')]);
    },
};

exports.rcpt_redis = {
    setUp : _set_up_redis,
    tearDown : _tear_down_redis,
    'miss' : function (test) {
        var addr = new Address('<matt@example.com>');
        if (this.plugin.redis_pings) {
            this.plugin.delete_route(addr.address());
            test.expect(2);
            var cb = function (rc, msg) {
                test.equal(rc, undefined);
                test.equal(msg, undefined);
                test.done();
            }.bind(this);
            this.plugin.rcpt(cb, this.connection, [addr]);
        }
        else {
            test.expect(0);
            test.done();
        }
    },
    'hit' : function (test) {
        var addr = new Address('<matt@example.com>');
        if (this.plugin.redis_pings) {
            this.plugin.insert_route(addr.address(),'192.168.2.1');
            test.expect(2);
            var cb = function (rc, msg) {
                test.equal(rc, OK);
                test.equal(msg, undefined);
                test.done();
            }.bind(this);
            this.plugin.rcpt(cb, this.connection, [addr]);
        }
        else {
            test.expect(0);
            test.done();
        }
    },
};

exports.get_mx_file = {
    setUp : _set_up_file,
    'email address file hit' : function (test) {
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
    'email domain file hit' : function (test) {
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
    'address preferred file' : function (test) {
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

exports.get_mx_redis = {
    setUp : _set_up_redis,
    tearDown : _tear_down_redis,
    'email address redis hit' : function (test) {
        if (this.plugin.redis_pings) {
            var addr = new Address('<matt@example.com>');
            test.expect(2);
            this.plugin.insert_route('matt@example.com','192.168.2.1');
            this.plugin.get_mx(function (rc, mx) {
                test.equal(rc, OK);
                test.equal(mx, '192.168.2.1');
                test.done();
                this.plugin.delete_route(addr.address());
            }, hmail, addr.host).bind(this);
        }
        else {
            test.expect(0);
            test.done();
        }
    },
    'email domain redis hit' : function (test) {
        if (this.plugin.redis_pings) {
            var addr = new Address('<matt@example.com>');
            test.expect(2);
            this.plugin.insert_route(addr.address(),'192.168.2.2');
            var cb = function (rc, mx) {
                test.equal(rc, OK);
                test.equal(mx, '192.168.2.2');
                test.done();
                this.plugin.delete_route(addr.address());
            }.bind(this);
            this.plugin.get_mx(cb, hmail, addr.host);
        }
        else {
            test.expect(0);
            test.done();
        }
    },
    'address preferred redis' : function (test) {
        if (this.plugin.redis_pings) {
            test.expect(2);
            this.plugin.insert_route('matt@example.com','192.168.2.1');
            this.plugin.insert_route(     'example.com','192.168.2.2');
            var addr = new Address('<matt@example.com>');

            var cb = function (rc, mx) {
                test.equal(rc, OK);
                test.equal(mx, '192.168.2.1');
                test.done();
                this.plugin.delete_route('matt@example.com');
                this.plugin.delete_route(     'example.com');
            }.bind(this);

            this.plugin.get_mx(cb, hmail, addr.host);
        }
        else {
            test.expect(0);
            test.done();
        }
    },
};
