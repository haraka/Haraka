var stub             = require('../fixtures/stub'),
    Connection       = require('../fixtures/stub_connection'),
    Plugin           = require('../fixtures/stub_plugin'),
    configfile       = require('../../configfile'),
    config           = require('../../config'),
//  Header           = require('../../mailheader').Header,
    ResultStore      = require("../../result_store"),
    constants        = require('../../constants');

try {
    var redis = require('redis');
}
catch (e) {
    console.log(e + "\nunable to load redis, skipping tests");
    return;
}

constants.import(global);

function _set_up(callback) {
    this.backup = {};

    // needed for tests
    this.plugin = Plugin('karma');
    this.plugin.config = config;
    this.plugin.cfg = { main: {} };
    this.plugin.deny_hooks = ['connect'];
    this.plugin.tarpit_hooks = ['connect'];

    this.connection = Connection.createConnection();
    this.connection.results = new ResultStore(this.plugin);
    this.connection.transaction = stub;
    this.connection.transaction.results = new ResultStore(this.plugin);

    callback();
}
function _tear_down(callback) {
    callback();
}

exports.karma_init = {
    setUp : _set_up,
    tearDown : _tear_down,
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
    tearDown : _tear_down,
    'init, pre': function (test) {
        test.expect(1);
        var r = this.connection.results.get('karma');
        test.equal(undefined, r);
        test.done();
    },
    'init, empty cfg': function (test) {
        this.plugin.results_init(this.connection);
        var r = this.connection.results.get('karma');
        test.expect(1);
        test.ok(r);
        test.done();
    },
    'init, cfg': function (test) {
        this.plugin.cfg.awards = { test: 1 };
        this.plugin.results_init(this.connection);
        var r = this.connection.results.get('karma');
        test.expect(2);
        test.ok(r);
        test.ok(r.todo);
        test.done();
    },
};

exports.assemble_note_obj = {
    setUp : _set_up,
    tearDown : _tear_down,
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

exports.max_concurrent = {
    setUp : _set_up,
    tearDown : _tear_down,
    'no results': function (test) {
        test.expect(2);
        var cb = function (rc, msg) {
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            test.done();
        }.bind(this);
        this.plugin.max_concurrent(cb, this.connection);
    },
    'results fail=0': function (test) {
        test.expect(2);
        var cb = function (rc, msg) {
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            test.done();
        }.bind(this);
        this.connection.results.add(this.plugin, {pass: 'test pass'});
        this.plugin.max_concurrent(cb, this.connection);
    },
    'results fail=max_concurrent': function (test) {
        test.expect(2);
        var cb = function (rc, msg) {
            test.equal(DENYSOFTDISCONNECT, rc);
            test.ok(msg);
            test.done();
        }.bind(this);
        this.plugin.cfg.concurrency = {disconnect_delay: 1};
        this.connection.results.add(this.plugin, {fail: 'max_concurrent'});
        this.plugin.max_concurrent(cb, this.connection);
    },
};

exports.hook_deny = {
    setUp : _set_up,
    tearDown : _tear_down,
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
        this.plugin.hook_deny(next, this.connection, ['','','access','']);
    },
    'pi_hook=rcpt_to': function (test) {
        test.expect(1);
        var next = function (rc) {
            test.equal(undefined, rc);
            test.done();
        };
        this.plugin.hook_deny(next, this.connection, ['','','','','','rcpt_to']);
    },
    'pi_hook=queue': function (test) {
        test.expect(1);
        var next = function (rc) {
            test.equal(undefined, rc);
            test.done();
        };
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

exports.max_concurrent = {
    setUp : _set_up,
    tearDown : _tear_down,
    'no results': function (test) {
        test.expect(2);
        var next = function (rc, msg) {
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            test.done();
        };
        this.plugin.max_concurrent(next, this.connection);
    },
    'no matching fail': function (test) {
        test.expect(2);
        var next = function (rc, msg) {
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            test.done();
        };
        this.connection.results.add(this.plugin, {fail: 'test'});
        this.plugin.max_concurrent(next, this.connection);
    },
    'matching fail': function (test) {
        test.expect(3);
        var before = Date.now();
        var next = function (rc, msg) {
            test.ok(Date.now() >= before + 1);
            test.equal(DENYSOFTDISCONNECT, rc);
            test.ok(msg);
            test.done();
        };
        this.connection.results.add(this.plugin, {fail: 'max_concurrent'});
        this.plugin.cfg.concurrency = {disconnect_delay: 1};
        this.plugin.max_concurrent(next, this.connection);
    },
};

exports.karma_penalty = {
    setUp : _set_up,
    tearDown : _tear_down,
    'no results': function (test) {
        test.expect(2);
        var next = function (rc, msg) {
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            test.done();
        };
        this.plugin.karma_penalty(next, this.connection);
    },
    'no matching fail': function (test) {
        test.expect(2);
        var next = function (rc, msg) {
            test.equal(undefined, rc);
            test.equal(undefined, msg);
            test.done();
        };
        this.connection.results.add(this.plugin, {fail: 'test'});
        this.plugin.karma_penalty(next, this.connection);
    },
    'matching fail': function (test) {
        test.expect(3);
        var before = Date.now();
        var next = function (rc, msg) {
            test.ok(Date.now() >= before + 1);
            test.equal(DENYDISCONNECT, rc);
            test.ok(msg);
            test.done();
        };
        this.connection.results.add(this.plugin, {fail: 'penalty'});
        this.plugin.cfg.penalty = {disconnect_delay: 1};
        this.plugin.karma_penalty(next, this.connection);
    },
};

exports.get_award_location = {
    setUp : _set_up,
    tearDown : _tear_down,
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
        this.connection.results.add({name: 'connect.geoip'}, { country: 'US' });
        var r = this.plugin.get_award_location(this.connection, 'results.connect.geoip');
        // console.log(r);
        test.equal('US', r.country);
        test.done();
    },
    'results.karma': function (test) {
        test.expect(1);
        this.connection.results.add({name: 'karma'}, { connect: -1 });
        var r = this.plugin.get_award_location(this.connection, 'results.karma');
        // console.log(r);
        test.equal(-1, r.connect);
        test.done();
    },
    'results.karma, txn': function (test) {
        // results should be found in conn or txn
        test.expect(1);
        this.connection.transaction.results.add({name: 'karma'}, { connect: -1 });
        var r = this.plugin.get_award_location(this.connection, 'results.karma');
        // console.log(r);
        test.equal(-1, r.connect);
        test.done();
    },
    'txn.results.karma': function (test) {
        // these results shouldn't be found, b/c txn specified
        test.expect(1);
        this.connection.results.add({name: 'karma'}, { connect: -1 });
        var r = this.plugin.get_award_location(this.connection, 'transaction.results.karma');
        // console.log(r);
        test.equal(undefined, r);
        test.done();
    },
};

exports.get_award_condition = {
    setUp : _set_up,
    tearDown : _tear_down,
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
};

exports.check_awards = {
    setUp : _set_up,
    tearDown : _tear_down,
    'no results': function (test) {
        test.expect(1);
        var r = this.plugin.check_awards(this.connection);
        test.equal(undefined, r);
        test.done();
    },
    'no todo': function (test) {
        test.expect(1);
        this.connection.results.add({name: 'karma'}, { todo: { } });
        var r = this.plugin.check_awards(this.connection);
        test.equal(undefined, r);
        test.done();
    },
    'geoip gt': function (test) {
        test.expect(2);

        // populate the karma result with a todo item
        this.connection.results.add({name: 'karma'}, {
            todo: { 'results.connect.geoip.distance@4000': '-1 if gt 4000' }
        });
        // test a non-matching criteria
        this.connection.results.add({name: 'connect.geoip'}, { distance: 4000 });
        // check awards
        this.plugin.check_awards(this.connection);
        test.equal(undefined, this.connection.results.get('karma').fail[0]);

        // test a matching criteria
        this.connection.results.add({name: 'connect.geoip'}, { distance: 4001 });
        // check awards
        this.plugin.check_awards(this.connection);
        // test that the award was applied
        test.equal('geoip.distance', this.connection.results.get('karma').fail[0]);

        test.done();
    },
};

exports.apply_tarpit = {
    setUp : _set_up,
    tearDown : _tear_down,
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
        this.connection.results.add(this.plugin, { connect: -2 });
        this.plugin.apply_tarpit(this.connection, 'connect', -2, next);
    },
};

exports.should_we_deny = {
    setUp : _set_up,
    tearDown : _tear_down,
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
        this.connection.results.add(this.plugin, { connect: 'blah' });
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
        this.connection.results.add(this.plugin, { connect: -1 });
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
        this.plugin.deny_hooks = ['connect'];
        this.connection.results.add(this.plugin, { connect: -6 });
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
        this.plugin.deny_hooks = ['helo'];
        this.connection.results.add(this.plugin, { connect: -6 });
        this.plugin.should_we_deny(next, this.connection, 'connect');
    },
};
