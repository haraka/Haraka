var stub         = require('./fixtures/stub');
var Connection   = require('./fixtures/stub_connection');
var configfile   = require('../configfile');
var config       = require('../config');
var ResultStore  = require('../result_store');

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
        this.connection.results.add('test_plugin', { pass: 'test pass' });
        delete this.connection.results.store.test_plugin.human;
        delete this.connection.results.store.test_plugin.human_html;
        test.deepEqual(
                { pass: ['test pass'], fail: [], msg: [], err: [], skip: [] },
                this.connection.results.get('test_plugin')
                );
        test.done();
    },
    'init add array' : function (test) {
        test.expect(1);
        this.connection.results.add('test_plugin', { pass: 1 });
        this.connection.results.add('test_plugin', { pass: [2,3] });
        delete this.connection.results.store.test_plugin.human;
        delete this.connection.results.store.test_plugin.human_html;
        test.deepEqual(
                { pass: [1,2,3], fail: [], msg: [], err: [], skip: [] },
                this.connection.results.get('test_plugin')
                );
        test.done();
    },
    'init incr' : function (test) {
        test.expect(1);
        this.connection.results.incr('test_plugin', { counter: 1 });
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
        this.connection.results.push('test_plugin', { pass: 'test1' });
        delete this.connection.results.store.test_plugin.human;
        delete this.connection.results.store.test_plugin.human_html;
        test.deepEqual(
                { pass: ['test1'], fail: [], msg: [], err: [], skip: [] },
                this.connection.results.get('test_plugin')
                );
        test.done();
    },
    'init push array' : function (test) {
        test.expect(1);
        /* jshint maxlen: 100 */
        this.connection.results.push('test_plugin', { pass: 'test1' });
        this.connection.results.push('test_plugin', { pass: ['test2'] });
        delete this.connection.results.store.test_plugin.human;
        delete this.connection.results.store.test_plugin.human_html;
        test.deepEqual(
                { pass: ['test1','test2'], fail: [], msg: [], err: [], skip: [] },
                this.connection.results.get('test_plugin')
                );
        test.done();
    },
    'init push, other' : function (test) {
        test.expect(1);
        this.connection.results.push('test_plugin', { other: 'test2' });
        delete this.connection.results.store.test_plugin.human;
        delete this.connection.results.store.test_plugin.human_html;
        test.deepEqual(
                { pass: [], other: ['test2'], fail: [], msg: [],
                  err: [], skip: [] },
                this.connection.results.get('test_plugin')
                );
        test.done();
    },
};

exports.has = {
    setUp : _set_up,
    tearDown : _tear_down,
    /* jshint maxlen: 100 */
    'has, list, string' : function (test) {
        test.expect(2);
        this.connection.results.add('test_plugin', { pass: 'test pass' });
        test.equal(true, this.connection.results.has('test_plugin', 'pass', 'test pass'));
        test.equal(false, this.connection.results.has('test_plugin', 'pass', 'test miss'));
        test.done();
    },
    'has, list, number' : function (test) {
        test.expect(2);
        this.connection.results.add('test_plugin', { msg: 1 });
        test.equal(true, this.connection.results.has('test_plugin', 'msg', 1));
        test.equal(false, this.connection.results.has('test_plugin', 'msg', 2));
        test.done();
    },
    'has, list, boolean' : function (test) {
        test.expect(2);
        this.connection.results.add('test_plugin', { msg: true });
        test.equal(true, this.connection.results.has('test_plugin', 'msg', true));
        test.equal(false, this.connection.results.has('test_plugin', 'msg', false));
        test.done();
    },
    'has, list, regexp' : function (test) {
        test.expect(3);
        this.connection.results.add('test_plugin', { pass: 'test pass' });
        test.ok(this.connection.results.has('test_plugin', 'pass', /test/));
        test.ok(this.connection.results.has('test_plugin', 'pass', / pass/));
        test.equal(this.connection.results.has('test_plugin', 'pass', /not/), false);
        test.done();
    },
    'has, string, string' : function (test) {
        test.expect(2);
        this.connection.results.add('test_plugin', { random_key: 'string value' });
        test.ok(this.connection.results.has('test_plugin', 'random_key', 'string value'));
        test.equal(false, this.connection.results.has('test_plugin', 'random_key', 'strings'));
        test.done();
    },
    'has, string, regex' : function (test) {
        test.expect(3);
        this.connection.results.add('test_plugin', { random_key: 'string value' });
        test.ok(this.connection.results.has( 'test_plugin', 'random_key', /string/));
        test.ok(this.connection.results.has( 'test_plugin', 'random_key', /value/));
        test.equal(false, this.connection.results.has('test_plugin', 'random_key', /miss/));
        test.done();
    },
};

exports.private_collate = {
    setUp : _set_up,
    tearDown : _tear_down,
    'collate, arrays are shown in output' : function (test) {
        test.expect(2);
        this.connection.results.push('test_plugin', { foo: 'bar' });
        // console.log(this.connection.results);
        test.equal(true, this.connection.results.has('test_plugin', 'foo', /bar/));
        test.ok(/bar/.test(this.connection.results.get('test_plugin').human));
        test.done();
    },
};
