
'use strict';
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const lines = [
    'From: John Johnson <john@example.com>',
    'To: Jane Johnson <jane@example.com>',
    "Subject: What's for dinner?",
    '',
    "I'm hungry.",
    '',
];

exports.outbound = {
    'converts \\n and \\r\\n line endings to \\r\\n' : function (test) {
        test.expect(2);

        ['\n', '\r\n'].forEach(function (ending) {
            let contents = lines.join(ending);
            let result = '';

            // Set data_lines to lines in contents
            let match;
            const re = /^([^\n]*\n?)/;
            while ((match = re.exec(contents))) {
                let line = match[1];
                line = line.replace(/\r?\n?$/, '\r\n'); // assure \r\n ending
                // transaction.add_data(new Buffer(line));
                result += line;
                contents = contents.substr(match[1].length);
                if (contents.length === 0) {
                    break;
                }
            }

            test.deepEqual(lines.join('\r\n'), result);
        });
        test.done();
    },
    'log_methods added': function (test) {
        const logger = require('../logger');
        test.expect(Object.keys(logger.levels).length);

        const HMailItem = require('../outbound').HMailItem;

        Object.keys(logger.levels).forEach(function (level) {
            test.ok(HMailItem.prototype['log' + level.toLowerCase()], "Log method for level: " + level);
        });
        test.done();
    }
};

exports.qfile = {
    setUp : function (done) {
        this.qfile = require('../outbound').qfile;
        done();
    },
    'name() basic functions': function (test){
        test.expect(3);
        const name = this.qfile.name();
        const split = name.split('_');
        test.equal(split.length, 7);
        test.equal(split[2], 0);
        test.equal(split[3], process.pid);
        test.done();
    },
    'name() with overrides': function (test){
        test.expect(7);
        const overrides = {
            arrival : 12345,
            next_attempt : 12345,
            attempts : 15,
            pid : process.pid,
            uid : 'XXYYZZ',
            host : os.hostname(),
        };
        const name = this.qfile.name(overrides);
        const split = name.split('_');
        test.equal(split.length, 7);
        test.equal(split[0], overrides.arrival);
        test.equal(split[1], overrides.next_attempt);
        test.equal(split[2], overrides.attempts);
        test.equal(split[3], overrides.pid);
        test.equal(split[4], overrides.uid);
        test.equal(split[6], overrides.host);
        test.done();
    },
    'rnd_unique() is unique-ish': function (test){
        const repeats = 1000;
        test.expect(repeats);
        const u = this.qfile.rnd_unique();
        for (let i = 0; i < repeats; i++){
            test.notEqual(u, this.qfile.rnd_unique());
        }
        test.done();
    },
    'parts() updates previous queue filenames': function (test){
        test.expect(4);
        // $nextattempt_$attempts_$pid_$uniq.$host
        const name = "1111_0_2222_3333.foo.example.com"
        const parts = this.qfile.parts(name);
        test.equal(parts.next_attempt, 1111);
        test.equal(parts.attempts, 0);
        test.equal(parts.pid, 2222);
        test.equal(parts.host, 'foo.example.com');
        test.done();
    },
    'parts() handles standard queue filenames': function (test){
        test.expect(6);
        const overrides = {
            arrival : 12345,
            next_attempt : 12345,
            attempts : 15,
            pid : process.pid,
            uid : 'XXYYZZ',
            host : os.hostname(),
        };
        const name = this.qfile.name(overrides);
        const parts = this.qfile.parts(name);
        test.equal(parts.arrival, overrides.arrival);
        test.equal(parts.next_attempt, overrides.next_attempt);
        test.equal(parts.attempts, overrides.attempts);
        test.equal(parts.pid, overrides.pid);
        test.equal(parts.uid, overrides.uid);
        test.equal(parts.host, overrides.host);
        test.done();
    }
};

exports.get_tls_options = {
    setUp : function (done) {
        process.env.HARAKA_TEST_DIR=path.resolve('tests');
        this.outbound = require('../outbound');
        this.obtls = require('../outbound/tls');
        done();
    },
    tearDown: function (done) {
        delete process.env.HARAKA_TEST_DIR;
        done();
    },
    'gets TLS properties from tls.ini.outbound': function (test) {
        test.expect(1);

        // reset config to load from tests directory
        const testDir = path.resolve('tests');
        this.outbound.net_utils.config = this.outbound.net_utils.config.module_config(testDir);
        this.outbound.config = this.outbound.config.module_config(testDir);
        this.obtls.config = this.outbound.config;

        const tls_config = this.obtls.get_tls_options(
            { exchange: 'mail.example.com'}
        );

        test.deepEqual(tls_config, {
            servername: 'mail.example.com',
            key: fs.readFileSync(path.resolve('tests','config','outbound_tls_key.pem')),
            cert: fs.readFileSync(path.resolve('tests','config','outbound_tls_cert.pem')),
            dhparam: fs.readFileSync(path.resolve('tests','config','dhparams.pem')),
            ciphers: 'ECDHE-RSA-AES256-GCM-SHA384',
            rejectUnauthorized: false,
            requestCert: false,
            honorCipherOrder: false
        });
        test.done();
    },
}
