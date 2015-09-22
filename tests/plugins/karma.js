'use strict';

var stub             = require('../fixtures/stub');
var Connection       = require('../fixtures/stub_connection');
var Plugin           = require('../fixtures/stub_plugin');
var config           = require('../../config');
var ResultStore      = require("../../result_store");

try {
    var redis = require('redis');
}
catch (e) {
    console.log(e + "\nunable to load redis, skipping tests");
    return;
}

var _set_up = function (done) {

    this.plugin = new Plugin('karma');

    this.plugin.config = config;
    this.plugin.cfg = { main: {} };
    this.plugin.deny_hooks = {'connect': true};
    this.plugin.tarpit_hooks = ['connect'];

    this.connection = Connection.createConnection({}, { notes: {} });

    this.connection.transaction = stub;
    this.connection.transaction.results = new ResultStore(this.plugin);

    done();
};

exports.karma_init = {
    setUp : _set_up,
    'register': function (test) {
        test.expect(2);
        this.plugin.register();
        test.ok(this.plugin.cfg.asn);
        test.ok(this.plugin.deny_hooks);
        test.done();
    },
};

exports.results_init = {
    setUp : _set_up,
    'init, pre': function (test) {
        test.expect(1);
        var r = this.connection.results.get('karma');
        test.equal(undefined, r);
        test.done();
    },
    'init, empty cfg': function (test) {
        this.plugin.results_init(stub, this.connection);
        var r = this.connection.results.get('karma');
        test.expect(1);
        test.ok(r);
        test.done();
    },
    'init, cfg': function (test) {
        this.plugin.cfg.awards = { test: 1 };
        this.plugin.results_init(stub, this.connection);
        var r = this.connection.results.get('karma');
        test.expect(2);
        test.ok(r);
        test.ok(r.todo);
        test.done();
    },
};

exports.assemble_note_obj = {
    setUp : _set_up,
    'no auth fails': function (test) {
        test.expect(1);
        var obj = this.plugin.assemble_note_obj(this.connection, 'notes.auth_fails');
        test.equal(undefined, obj);
        test.done();
    },
    'has auth fails': function (test) {
        test.expect(1);
        this.connection.notes.auth_fails=[1,2];
        var obj = this.plugin.assemble_note_obj(this.connection, 'notes.auth_fails');
        test.deepEqual([1,2], obj);
        test.done();
    },
};

exports.hook_deny = {
    setUp : _set_up,
    'no params': function (test) {
        test.expect(1);
        var next = function (rc) {
            test.equal(OK, rc);
            test.done();
        };
        this.plugin.hook_deny(next, this.connection, ['','','','']);
    },
    'pi_name=karma': function (test) {
        test.expect(1);
        var next = function (rc) {
            test.equal(undefined, rc);
            test.done();
        };
        this.plugin.hook_deny(next, this.connection, ['','','karma','']);
    },
    'pi_name=access': function (test) {
        test.expect(1);
        var next = function (rc) {
            test.equal(undefined, rc);
            test.done();
        };
        this.plugin.deny_exclude_plugins = { access: true };
        this.plugin.hook_deny(next, this.connection, ['','','access','']);
    },
    'pi_hook=rcpt_to': function (test) {
        test.expect(1);
        var next = function (rc) {
            test.equal(undefined, rc);
            test.done();
        };
        this.plugin.deny_exclude_hooks = { rcpt_to: true };
        this.plugin.hook_deny(next, this.connection,
                ['','','','','','rcpt_to']);
    },
    'pi_hook=queue': function (test) {
        test.expect(1);
        var next = function (rc) {
            test.equal(undefined, rc);
            test.done();
        };
        this.plugin.deny_exclude_hooks = { queue: true };
        this.plugin.hook_deny(next, this.connection, ['','','','','','queue']);
    },
    'denysoft': function (test) {
        test.expect(1);
        var next = function (rc) {
            test.equal(undefined, rc);
            test.done();
        };
        this.plugin.hook_deny(next, this.connection, [DENYSOFT,'','','','','']);
    },
};

exports.get_award_location = {
    setUp : _set_up,
    'relaying=false': function (test) {
        test.expect(1);
        this.connection.relaying=false;
        var r = this.plugin.get_award_location(this.connection, 'relaying');
        test.equal(false, r);
        test.done();
    },
    'relaying=true': function (test) {
        test.expect(1);
        this.connection.relaying=true;
        var r = this.plugin.get_award_location(this.connection, 'relaying');
        test.equal(true, r);
        test.done();
    },
    'notes.undef=2': function (test) {
        test.expect(1);
        var r = this.plugin.get_award_location(this.connection, 'notes.undef');
        test.equal(undefined, r);
        test.done();
    },
    'notes.tarpit=2': function (test) {
        test.expect(1);
        this.connection.notes = { tarpit: 2 };
        var r = this.plugin.get_award_location(this.connection, 'notes.tarpit');
        test.equal(2, r);
        test.done();
    },
    'results.connect.geoip': function (test) {
        test.expect(1);
        this.connection.results.add('connect.geoip', { country: 'US' });
        var r = this.plugin.get_award_location(this.connection, 'results.connect.geoip');
        // console.log(r);
        test.equal('US', r.country);
        test.done();
    },
    'results.karma': function (test) {
        test.expect(1);
        this.connection.results.add('karma', { score: -1 });
        var r = this.plugin.get_award_location(this.connection, 'results.karma');
        // console.log(r);
        test.equal(-1, r.score);
        test.done();
    },
    'results.karma, txn': function (test) {
        // results should be found in conn or txn
        test.expect(1);
        this.connection.transaction.results.add('karma', { score: -1 });
        var r = this.plugin.get_award_location(this.connection, 'results.karma');
        // console.log(r);
        test.equal(-1, r.score);
        test.done();
    },
    'txn.results.karma': function (test) {
        // these results shouldn't be found, b/c txn specified
        test.expect(1);
        this.connection.results.add('karma', { score: -1 });
        var r = this.plugin.get_award_location(this.connection, 'transaction.results.karma');
        // console.log(r);
        test.equal(undefined, r);
        test.done();
    },
    'results.auth/auth_base': function (test) {
        test.expect(1);
        this.connection.results.add('auth/auth_base', { fail: 'PLAIN' });
        var r = this.plugin.get_award_location(this.connection, 'results.auth/auth_base');
        test.equal('PLAIN', r.fail[0]);
        test.done();
    },
};

exports.get_award_condition = {
    setUp : _set_up,
    'geoip.distance': function (test) {
        test.expect(2);
        test.equal(4000, this.plugin.get_award_condition(
            'results.geoip.distance@4000', '-1 if gt'
        ));
        test.equal(4000, this.plugin.get_award_condition(
            'results.geoip.distance@uniq', '-1 if gt 4000'
        ));
        test.done();
    },
    'auth/auth_base': function (test) {
        test.expect(1);
        test.equal('plain', this.plugin.get_award_condition(
            'results.auth/auth_base.fail@plain', '-1 if in'
        ));
        test.done();
    },
};

exports.check_awards = {
    setUp : _set_up,
    'no results': function (test) {
        test.expect(1);
        var r = this.plugin.check_awards(this.connection);
        test.equal(undefined, r);
        test.done();
    },
    'no todo': function (test) {
        test.expect(1);
        this.connection.results.add('karma', { todo: { } });
        var r = this.plugin.check_awards(this.connection);
        test.equal(undefined, r);
        test.done();
    },
    'geoip gt': function (test) {
        test.expect(2);

        // populate the karma result with a todo item
        this.connection.results.add('karma', {
            todo: { 'results.connect.geoip.distance@4000': '-1 if gt 4000' }
        });
        // test a non-matching criteria
        this.connection.results.add('connect.geoip', { distance: 4000 });
        // check awards
        this.plugin.check_awards(this.connection);
        test.equal(undefined, this.connection.results.get('karma').fail[0]);

        // test a matching criteria
        this.connection.results.add('connect.geoip', { distance: 4001 });
        // check awards
        this.plugin.check_awards(this.connection);
        // test that the award was applied
        test.equal('geoip.distance', this.connection.results.get('karma').fail[0]);

        test.done();
    },
    'auth failure': function (test) {
        test.expect(2);
        this.connection.results.add('karma', {
            todo: { 'results.auth/auth_base.fail@PLAIN': '-1 if in' }
        });
        this.connection.results.add('auth/auth_base',
                {fail: 'PLAIN'});
        var r = this.plugin.check_awards(this.connection);
        test.equal(undefined, r);
        test.equal('auth/auth_base.fail', this.connection.results.get('karma').fail[0]);
        test.done();
    },
    'valid recipient': function (test) {
        test.expect(2);
        this.connection.results.add('karma', {
            todo: { 'results.rcpt_to.qmd.pass@exist': '1 if in' }
        });
        this.connection.results.add('rcpt_to.qmd', {pass: 'exist'});
        var r = this.plugin.check_awards(this.connection);
        test.equal(undefined, r);
        test.equal('qmd.pass', this.connection.results.get('karma').pass[0]);
        test.done();
    },
};

exports.apply_tarpit = {
    setUp : _set_up,
    'tarpit=false': function (test) {
        test.expect(2);
        var next = function (rc, msg) {
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            test.done();
        };
        this.plugin.apply_tarpit(this.connection, 'connect', 0, next);
    },
    'tarpit=true, score=0': function (test) {
        test.expect(2);
        var next = function (rc, msg) {
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            test.done();
        };
        this.plugin.cfg.tarpit = { max: 1, delay: 0 };
        this.plugin.apply_tarpit(this.connection, 'connect', 0, next);
    },
    'tarpit=true, score=1': function (test) {
        test.expect(2);
        var next = function (rc, msg) {
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            test.done();
        };
        this.plugin.cfg.tarpit = { max: 1, delay: 0 };
        this.plugin.apply_tarpit(this.connection, 'connect', 1, next);
    },
    'tarpit=true, score=-1': function (test) {
        test.expect(3);
        var before = Date.now();
        var next = function (rc, msg) {
            test.ok(Date.now() >= before + 1);
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            test.done();
        };
        this.plugin.cfg.tarpit = { max: 1, delay: 0 };
        this.plugin.apply_tarpit(this.connection, 'connect', -1, next);
    },
    'tarpit=true, score=-2, max=1': function (test) {
        test.expect(3);
        var before = Date.now();
        var next = function (rc, msg) {
            test.ok(Date.now() >= before + 1);
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            test.done();
        };
        this.plugin.cfg.tarpit = { max: 1, delay: 0 };
        this.plugin.apply_tarpit(this.connection, 'connect', -2, next);
    },
    'tarpit=true, score=connect, max=1': function (test) {
        test.expect(3);
        var before = Date.now();
        var next = function (rc, msg) {
            test.ok(Date.now() >= before + 1);
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            test.done();
        };
        this.plugin.cfg.tarpit = { max: 1, delay: 0 };
        this.connection.results.add(this.plugin, { score: -2 });
        this.plugin.apply_tarpit(this.connection, 'connect', -2, next);
    },
};

exports.should_we_deny = {
    setUp : _set_up,
    'no results': function (test) {
        test.expect(2);
        var next = function (rc, msg) {
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            test.done();
        };
        this.plugin.should_we_deny(next, this.connection, 'connect');
    },
    'no score': function (test) {
        test.expect(2);
        var next = function (rc, msg) {
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            test.done();
        };
        this.connection.results.add(this.plugin, { test: 'blah' });
        this.plugin.should_we_deny(next, this.connection, 'connect');
    },
    'invalid score': function (test) {
        test.expect(2);
        var next = function (rc, msg) {
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            test.done();
        };
        this.connection.results.add(this.plugin, { score: 'blah' });
        this.plugin.should_we_deny(next, this.connection, 'connect');
    },
    'valid score, okay': function (test) {
        test.expect(2);
        var next = function (rc, msg) {
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            test.done();
        }.bind(this);
        this.plugin.cfg.tarpit = { max: 1, delay: 0 };
        this.connection.results.add(this.plugin, { score: -1 });
        this.plugin.should_we_deny(next, this.connection, 'connect');
    },
    'valid score, -6, deny_hook': function (test) {
        test.expect(2);
        var next = function (rc, msg) {
            test.equal(DENY, rc);
            test.ok(msg);
            test.done();
        }.bind(this);
        this.plugin.cfg.tarpit = { max: 1, delay: 0 };
        this.plugin.deny_hooks = { connect: true};
        this.connection.results.add(this.plugin, { score: -6 });
        this.plugin.should_we_deny(next, this.connection, 'connect');
    },
    'valid score, -6, pass_hook': function (test) {
        test.expect(2);
        var next = function (rc, msg) {
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            test.done();
        }.bind(this);
        this.plugin.cfg.tarpit = { max: 1, delay: 0 };
        this.plugin.deny_hooks = { helo: true };
        this.connection.results.add(this.plugin, { score: -6 });
        this.plugin.should_we_deny(next, this.connection, 'connect');
    },
};

exports.check_result_equal = {
    setUp : _set_up,
    'equal match is scored': function (test) {
        test.expect(2);
        var award = {
            id         : 1,           award      : 2,
            operator   : 'equals',    value      : 'clean',
            reason     : 'testing',   resolution : 'never',
        };
        this.plugin.check_result_equal(['clean'], award, this.connection);
        test.equals(this.connection.results.store.karma.score, 2);
        test.equals(this.connection.results.store.karma.awards[0], 1);
        test.done();
    },
    'not equal match is not scored': function (test) {
        test.expect(1);
        var award = {
            id         : 1,           award      : 2,
            operator   : 'equals',    value      : 'dirty',
            reason     : 'testing',   resolution : 'never',
        };
        this.plugin.check_result_equal(['clean'], award, this.connection);
        test.equals(this.connection.results.store.karma, undefined);
        test.done();
    }
};

exports.check_result_gt = {
    setUp : _set_up,
    'gt match is scored': function (test) {
        test.expect(2);
        var award = {
            id         : 5,           award      : 3,
            operator   : 'gt',        value      : 3,
            reason     : 'testing',   resolution : 'never',
        };
        this.plugin.check_result_gt([4], award, this.connection);
        // console.log(this.connection.results.store);
        test.equals(this.connection.results.store.karma.score, 3);
        test.equals(this.connection.results.store.karma.awards[0], 5);
        test.done();
    }
};

exports.check_result_lt = {
    setUp : _set_up,
    'lt match is scored': function (test) {
        test.expect(2);
        var award = {
            id         : 2,           award      : 3,
            operator   : 'lt',        value      : 5,
            reason     : 'testing',   resolution : 'never',
        };
        this.plugin.check_result_lt([4], award, this.connection);
        // console.log(this.connection.results.store);
        test.equals(this.connection.results.store.karma.score, 3);
        test.equals(this.connection.results.store.karma.awards[0], 2);
        test.done();
    },
    'lt match not scored': function (test) {
        test.expect(1);
        var award = {
            id         : 3,           award      : 3,
            operator   : 'lt',        value      : 3,
            reason     : 'testing',   resolution : 'never',
        };
        this.plugin.check_result_lt([4], award, this.connection);
        // console.log(this.connection.results.store);
        test.equals(this.connection.results.store.karma, undefined);
        test.done();
    }
};

exports.check_result_match = {
    setUp : _set_up,
    'match pattern is scored': function (test) {
        test.expect(2);
        var award = {
            id         : 1,           award      : 2,
            operator   : 'match',     value      : 'phish',
            reason     : 'testing',   resolution : 'never',
        };
        this.plugin.check_result_match(['isphishing'], award, this.connection);
        // console.log(this.connection.results.store);
        test.equals(this.connection.results.store.karma.score, 2);
        test.equals(this.connection.results.store.karma.awards[0], 1);
        test.done();
    },
    'mismatch is not scored': function (test) {
        test.expect(1);
        var award = {
            id         : 1,           award      : 2,
            operator   : 'match',     value      : 'dirty',
            reason     : 'testing',   resolution : 'never',
        };
        this.plugin.check_result_match(['clean'], award, this.connection);
        // console.log(this.connection.results.store);
        test.equals(this.connection.results.store.karma, undefined);
        test.done();
    },
    'FCrDNS match is scored': function (test) {
        test.expect(2);
        var award = {
            id         : 89,         award      : 2,
            operator   : 'match',     value      : 'google.com',
            reason     : 'testing',   resolution : 'never',
        };
        this.plugin.check_result_match(['mail-yk0-f182.google.com'], award, this.connection);
        // console.log(this.connection.results.store);
        test.equals(this.connection.results.store.karma.score, 2);
        test.equals(this.connection.results.store.karma.awards[0], 89);
        test.done();
    },
};

exports.check_result = {
    setUp : _set_up,
    'geoip country is scored': function (test) {
        test.expect(2);
        this.plugin.cfg.result_awards = {
            1: 'connect.geoip | country | equals | CN | 2',
        };
        this.plugin.preparse_result_awards();
        this.connection.results.add({name: 'connect.geoip'}, {country: 'CN'});
        this.plugin.check_result(this.connection,
                '{"plugin":"connect.geoip","result":{"country":"CN"}}');
        // console.log(this.connection.results.store);
        test.equals(this.connection.results.store.karma.score, 2);
        test.equals(this.connection.results.store.karma.awards[0], 1);
        test.done();
    },
    'dnsbl listing is scored': function (test) {
        test.expect(2);
        this.plugin.cfg.result_awards = {
            2: 'dnsbl | fail | equals | dnsbl.sorbs.net | -5',
        };
        this.plugin.preparse_result_awards();
        this.connection.results.add({name: 'dnsbl'}, {fail: 'dnsbl.sorbs.net'});
        this.plugin.check_result(this.connection,
                '{"plugin":"dnsbl","result":{"fail":"dnsbl.sorbs.net"}}');
        // console.log(this.connection.results.store);
        test.equals(this.connection.results.store.karma.score, -5);
        test.equals(this.connection.results.store.karma.awards[0], 2);
        test.done();
    },
};

