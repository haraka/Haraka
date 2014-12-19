'use strict';

var Plugin       = require('../fixtures/stub_plugin');
var config       = require('../../config');
var Connection   = require('../fixtures/stub_connection');

var _set_up = function (done) {

    this.plugin = new Plugin('dnsbl');
    this.plugin.config = config;

    this.connection = Connection.createConnection();

    done();
};

exports.load_config = {
    setUp : _set_up,
    'none': function (test) {
        test.expect(1);
        test.equal(undefined, this.plugin.cfg);
        test.done();
    },
    'defaults': function (test) {
        test.expect(3);
        this.plugin.load_config();
        test.equal(true, this.plugin.cfg.main.reject);
        test.equal(30,     this.plugin.cfg.main.periodic_checks);
        test.equal('first', this.plugin.cfg.main.search);
        test.done();
    },
};

exports.get_uniq_zones = {
    setUp : _set_up,
    'none': function (test) {
        test.expect(1);
        test.equal(undefined, this.plugin.zones);
        test.done();
    },
    'dnsbl.zones': function (test) {
        test.expect(2);
        this.plugin.load_config();
        this.plugin.cfg.main.zones = 'dnsbl.test, dnsbl2.test';
        this.plugin.get_uniq_zones();
        test.notEqual(-1, this.plugin.zones.indexOf('dnsbl.test'));
        test.notEqual(-1, this.plugin.zones.indexOf('dnsbl2.test'));

        test.done();
    },
};

exports.should_skip = {
    setUp : _set_up,
    'no connection': function (test) {
        test.expect(1);
        test.equal(true, this.plugin.should_skip());
        test.done();
    },
    'no remote_ip': function (test) {
        test.expect(1);
        
        test.equal(true, this.plugin.should_skip(this.connection));
        test.done();
    },
    'private remote_ip, no zones': function (test) {
        test.expect(1);
        this.connection.remote_ip = '192.168.1.1';
        test.equal(true, this.plugin.should_skip(this.connection));
        test.done();
    },
    'private remote_ip': function (test) {
        test.expect(1);
        this.connection.remote_ip = '192.168.1.1';

        this.plugin.load_config();
        this.plugin.cfg.main.zones = 'dnsbl.test, dnsbl2.test';
        this.plugin.get_uniq_zones();

        test.equal(true, this.plugin.should_skip(this.connection));
        test.done();
    },
    'public remote_ip': function (test) {
        test.expect(1);
        this.connection.remote_ip = '208.1.1.1';

        this.plugin.load_config();
        this.plugin.cfg.main.zones = 'dnsbl.test, dnsbl2.test';
        this.plugin.get_uniq_zones();

        test.equal(false, this.plugin.should_skip(this.connection));
        test.done();
    },
    'public remote_ip, no zones': function (test) {
        test.expect(1);
        this.connection.remote_ip = '208.1.1.1';
        test.equal(true, this.plugin.should_skip(this.connection));
        test.done();
    },
};
