'use strict';

var path         = require('path');

var fixtures     = require('haraka-test-fixtures');

var _set_up = function (done) {

    try {
        this.plugin = new fixtures.plugin('log.elasticsearch');
    }
    catch (e) {
        console.error('unable to load log.elasticsearch plugin');
        return;
    }

    this.connection = fixtures.connection.createConnection();
    this.plugin.config.root_path = path.resolve(__dirname, '../../config');

    done();
};

exports.register = {
    setUp : _set_up,
    'has a register function' : function (test) {
        test.expect(2);
        test.isNotNull(this.plugin);
        test.isFunction(this.plugin.register);
        test.done();
    },
    /*
     * hard to test w/o connecting to an ES server
    'can run register function' : function (test) {
        test.expect(1);
        test.doesNotThrow(this.plugin.register());
        test.done();
    },
    */
};

exports.load_es_ini = {
    setUp : _set_up,
    'can load log.elasticsearch.ini' : function (test) {
        test.expect(2);
        this.plugin.load_es_ini();
        test.ok(this.plugin.cfg);
        test.ok(this.plugin.cfg.index);
        test.done();
    },
};

exports.objToArray = {
    setUp : _set_up,
    'converts an object to an array of key vals' : function (test) {
        test.expect(2);
        test.deepEqual([{k: 'foo', v: 'bar'}],
                this.plugin.objToArray({ foo: 'bar' }));
        test.deepEqual([{k: 'foo', v: 'bar'}, {k: 'baz', v: 'wuz'}],
                this.plugin.objToArray({ foo: 'bar', baz: 'wuz' }));
        test.done();
    },
};

exports.getIndexName = {
    setUp : _set_up,
    'gets index name for cxn or txn' : function (test) {
        test.expect(4);
        this.plugin.cfg = { index: {} };
        test.ok( /smtp\-connection\-/
                .test(this.plugin.getIndexName('connection')));
        test.ok( /smtp\-transaction\-/
                .test(this.plugin.getIndexName('transaction')));

        this.plugin.cfg.index.connection = 'cxn';
        this.plugin.cfg.index.transaction = 'txn';
        test.ok( /cxn\-/.test(this.plugin.getIndexName('connection')));
        test.ok( /txn\-/.test(this.plugin.getIndexName('transaction')));
        test.done();
    }
};

exports.populate_conn_properties = {
    setUp : _set_up,
    'adds conn.local' : function (test) {
        test.expect(1);
        this.connection.local.ip= '127.0.0.3';
        this.connection.local.port= '25';
        var result = {};
        var expected = { ip: '127.0.0.3', port: '25' };
        this.plugin.load_es_ini();
        this.plugin.populate_conn_properties(this.connection, result);
        delete result.local.host;
        test.deepEqual(expected, result.local);
        test.done();
    },
    'adds conn.remote' : function (test) {
        test.expect(1);
        this.connection.remote.ip='127.0.0.4';
        this.connection.remote.port='2525';
        var result = {};
        var expected = { ip: '127.0.0.4', port: '2525' };
        this.plugin.load_es_ini();
        this.plugin.populate_conn_properties(this.connection, result);
        delete result.remote.host;
        test.deepEqual(expected, result.remote);
        test.done();
    },
    'adds conn.helo' : function (test) {
        test.expect(1);
        this.connection.hello.host='testimerson';
        this.connection.hello.verb='EHLO';
        var result = {};
        var expected = { host: 'testimerson', verb: 'EHLO' };
        this.plugin.load_es_ini();
        this.plugin.populate_conn_properties(this.connection, result);
        delete result.remote.host;
        test.deepEqual(expected, result.hello);
        test.done();
    },
    'adds conn.count' : function (test) {
        test.expect(1);
        this.connection.errors=1;
        this.connection.tran_count=2;
        this.connection.msg_count= { accept: 0 };
        this.connection.rcpt_count= { reject: 1 };
        var result = {};
        var expected = {errors: 1, trans: 2,
            msg: { accept: 0 }, rcpt: { reject: 1 }
        };
        this.plugin.load_es_ini();
        this.plugin.populate_conn_properties(this.connection, result);
        delete result.remote.host;
        test.deepEqual(expected, result.count);
        test.done();
    },
};

exports.get_plugin_results = {
    setUp : _set_up,
    'adds plugin results to results object' : function (test) {
        test.expect(1);
        this.plugin.load_es_ini();
        this.connection.start_time = Date.now() - 1000;
        this.connection.results.add(this.plugin, { pass: 'test' });
        this.connection.results.add({name: 'queue'}, { pass: 'delivered' });
        var expected_result = {
            'log.elasticsearch': { pass: [ 'test' ] },
            'queue': { pass: [ 'delivered' ] },
        };
        delete this.plugin.cfg.top_level_names;
        var result = this.plugin.get_plugin_results(this.connection);
        test.deepEqual(expected_result, result);
        test.done();
    },
};

exports.trimPluginName = {
    setUp : _set_up,
    'trims off connection phase prefixes' : function (test) {
        test.expect(6);
        test.equal('headers', this.plugin.trimPluginName('data.headers'));
        test.equal('geoip', this.plugin.trimPluginName('connect.geoip'));
        test.equal('asn', this.plugin.trimPluginName('connect.asn'));
        test.equal('helo', this.plugin.trimPluginName('helo.checks'));
        test.equal('qmail_deliverable',
                this.plugin.trimPluginName('rcpt_to.qmail_deliverable'));
        test.equal('is_resolvable',
                this.plugin.trimPluginName('mail_from.is_resolvable'));
        test.done();
    },
};
