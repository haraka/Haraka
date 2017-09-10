'use strict';

const path = require('path');
const fixtures     = require('haraka-test-fixtures');
const ipaddr       = require('ipaddr.js');

const _set_up = function (done) {

    this.plugin = new fixtures.plugin('greylist');
    this.plugin.config.root_path = path.resolve(__dirname, '../../config');

    this.plugin.register();
    this.plugin.whitelist = {
        "mail":{"josef@example.com":true},
        "rcpt":{"josef@example.net":true},
        "ip":[
            ipaddr.parseCIDR('123.123.123.234/32'),
            ipaddr.parseCIDR('2a02:8204:d600:8060:7920:4040:20ee:9680/128'),
            ipaddr.parseCIDR('123.210.123.234/27'),
            ipaddr.parseCIDR('2a02:8204:d600:8060:7920:eeee::/96'),
        ]
    };
    this.plugin.list = {"dyndom":["sgvps.net"]};

    this.connection = fixtures.connection.createConnection();
    this.connection.transaction = {
        results: new fixtures.results(this.connection),
    };

    done();
};

exports.in_list = {
    setUp : _set_up,
    'inlist: mail(1)': function (test) {
        test.expect(1);
        test.ok(this.plugin.addr_in_list('mail', 'josef@example.com'));
        test.done();
    },
    'inlist: rcpt(1)': function (test) {
        test.expect(1);
        test.ok(this.plugin.addr_in_list('rcpt', 'josef@example.net'));
        test.done();
    },
    'inlist: dyndom(1)': function (test) {
        test.expect(1);
        test.ok(this.plugin.domain_in_list('dyndom', 'sgvps.net'));
        test.done();
    },
    'inlist: ip(4)': function (test) {
        test.expect(4);
        test.ok(this.plugin.ip_in_list('123.123.123.234'));
        test.ok(this.plugin.ip_in_list('123.210.123.234'));
        test.ok(this.plugin.ip_in_list('2a02:8204:d600:8060:7920:4040:20ee:9680'));
        test.ok(this.plugin.ip_in_list('2a02:8204:d600:8060:7920:eeee::ff00'));
        test.done();
    }
};
