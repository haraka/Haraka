'use strict';

var stub         = require('../fixtures/stub');
var Plugin       = require('../fixtures/stub_plugin');
var Connection   = require('../fixtures/stub_connection');
var Address      = require('../../address').Address;
var config       = require('../../config');
var ipaddr       = require('ipaddr.js');
var ResultStore  = require('../../result_store');

var _set_up = function (done) {

    this.plugin = new Plugin('data.greylist');
    this.plugin.config = config;
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

    this.connection = Connection.createConnection();
    this.connection.results = new ResultStore(this.connection);
    this.connection.transaction = {
        results: new ResultStore(this.connection),
    };

    done();
};

/* jshint maxlen: 100 */
exports.in_list = {
    setUp : _set_up,
    'is_sender_special, postmaster@example.com': function (test) {
        test.expect(1);
        test.equal(true,  this.plugin.is_sender_special('postmaster@example.com'));
        test.done();
    },
    'is_sender_special, double-bounce@example.com': function (test) {
        test.expect(1);
        test.equal(true,  this.plugin.is_sender_special('double-bounce@example.com'));
        test.done();
    },
    'is_sender_special, double-bounce-12345678@example.com': function (test) {
        test.expect(1);
        test.equal(true,  this.plugin.is_sender_special('double-bounce-12345678@example.com'));
        test.done();
    },
    '!is_sender_special, double-bounce-123456@example.com': function (test) {
        test.expect(1);
        test.equal(true,  this.plugin.is_sender_special('double-bounce-123456@example.com'));
        test.done();
    },
    '!is_sender_special, postwaster@example.com': function (test) {
        test.expect(1);
        test.equal(true,  this.plugin.is_sender_special('postwaster@example.com'));
        test.done();
    },
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
        console.log(this.plugin.ip_in_list('123.123.123.234'));
        test.ok(this.plugin.ip_in_list('123.123.123.234'));
        console.log(this.plugin.ip_in_list('123.210.123.234'));
        test.ok(this.plugin.ip_in_list('123.210.123.234'));
        console.log(this.plugin.ip_in_list('2a02:8204:d600:8060:7920:4040:20ee:9680'));
        test.ok(this.plugin.ip_in_list('2a02:8204:d600:8060:7920:4040:20ee:9680'));
        console.log(this.plugin.ip_in_list('2a02:8204:d600:8060:7920:eeee::ff00'));
        test.ok(this.plugin.ip_in_list('2a02:8204:d600:8060:7920:eeee::ff00'));
        test.done();
    }
};