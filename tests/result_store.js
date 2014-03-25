var stub         = require('./fixtures/stub'),
    Connection   = require('./fixtures/stub_connection'),
    configfile   = require('../configfile'),
    config       = require('../config'),
    ResultStore  = require('../result_store');

function _set_up(callback) {
    this.connection = Connection.createConnection();
    this.connection.results = new ResultStore(this.connection);
    callback();
}
function _tear_down(callback) {
    callback();
}

exports.default_result = {
    setUp : _set_up,
    tearDown : _tear_down,
    'init add' : function (test) {
        test.expect(1);
        this.connection.results.add({name: 'test_plugin'}, { pass: 'test pass' });
        delete this.connection.results.store.test_plugin.human;
        delete this.connection.results.store.test_plugin.human_html;
        test.deepEqual(
                { pass: ['test pass'], fail: [], msg: [], err: [], skip: [] },
                this.connection.results.get('test_plugin')
                );
        test.done();
    },
    'init incr' : function (test) {
        test.expect(1);
        this.connection.results.incr({name: 'test_plugin'}, { counter: 1 });
        delete this.connection.results.store.test_plugin.human;
        delete this.connection.results.store.test_plugin.human_html;
        test.deepEqual(
                { pass: [], fail: [], msg: [], err: [], skip: [], counter: 1 },
                this.connection.results.get('test_plugin')
                );
        test.done();
    },
    'init push' : function (test) {
        test.expect(1);
        this.connection.results.push({name: 'test_plugin'}, { pass: 'test1' });
        delete this.connection.results.store.test_plugin.human;
        delete this.connection.results.store.test_plugin.human_html;
        test.deepEqual(
                { pass: ['test1'], fail: [], msg: [], err: [], skip: [] },
                this.connection.results.get('test_plugin')
                );
        test.done();
    },
    'init push, other' : function (test) {
        test.expect(1);
        this.connection.results.push({name: 'test_plugin'}, { other: 'test2' });
        delete this.connection.results.store.test_plugin.human;
        delete this.connection.results.store.test_plugin.human_html;
        test.deepEqual(
                { pass: [], other: ['test2'], fail: [], msg: [], err: [], skip: [] },
                this.connection.results.get('test_plugin')
                );
        test.done();
    },
};

exports.has = {
    setUp : _set_up,
    tearDown : _tear_down,
    'has, list, string' : function (test) {
        test.expect(2);
        this.connection.results.add({name: 'test_plugin'}, { pass: 'test pass' });
        test.equal(true, this.connection.results.has('test_plugin', 'pass', 'test pass'));
        test.equal(false, this.connection.results.has('test_plugin', 'pass', 'test miss'));
        test.done();
    },
    'has, list, regexp' : function (test) {
        test.expect(3);
        this.connection.results.add({name: 'test_plugin'}, { pass: 'test pass' });
        test.ok(this.connection.results.has('test_plugin', 'pass', /test/));
        test.ok(this.connection.results.has('test_plugin', 'pass', / pass/));
        test.equal(this.connection.results.has('test_plugin', 'pass', /not/), false);
        test.done();
    },
    'has, string, string' : function (test) {
        test.expect(2);
        this.connection.results.add({name: 'test_plugin'}, { random_key: 'string value' });
        test.ok(this.connection.results.has('test_plugin', 'random_key', 'string value'));
        test.equal(false, this.connection.results.has('test_plugin', 'random_key', 'strings'));
        test.done();
    },
    'has, string, regex' : function (test) {
        test.expect(3);
        this.connection.results.add({name: 'test_plugin'}, { random_key: 'string value' });
        test.ok(this.connection.results.has('test_plugin', 'random_key', /string/));
        test.ok(this.connection.results.has('test_plugin', 'random_key', /value/));
        test.equal(false, this.connection.results.has('test_plugin', 'random_key', /miss/));
        test.done();
    },
};
