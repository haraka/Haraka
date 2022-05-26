
'use strict';
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const constants = require('haraka-constants');
const logger = require('../../logger');

const lines = [
    'From: John Johnson <john@example.com>',
    'To: Jane Johnson <jane@example.com>',
    "Subject: What's for dinner?",
    '',
    "I'm hungry.",
    '',
];

exports.outbound = {
    'converts \\n and \\r\\n line endings to \\r\\n' : test => {
        test.expect(2);

        ['\n', '\r\n'].forEach(ending => {
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
    'log_methods added': test => {
        test.expect(Object.keys(logger.levels).length);

        const HMailItem = require('../../outbound/hmail');

        Object.keys(logger.levels).forEach(level => {
            test.ok(HMailItem.prototype[`log${level.toLowerCase()}`], `Log method for level: ${level}`);
        });
        test.done();
    },
    'set_temp_fail_intervals coverage': test => {
        test.expect(5);

        const config = require('../../outbound/config');
        // Test default configuration
        test.deepEqual(config.cfg.temp_fail_intervals, [64,128,256,512,1024,2048,4096,8192,16384,32768,65536,131072]);
        // Test a simple configuration
        config.cfg.temp_fail_intervals = '10s, 1m*2';
        config.set_temp_fail_intervals();
        test.deepEqual(config.cfg.temp_fail_intervals, [10, 60, 60]);
        // Test a complex configuration
        config.cfg.temp_fail_intervals = '30s, 1m, 5m, 9m, 15m*3, 30m*2, 1h*3, 2h*3, 1d';
        config.set_temp_fail_intervals();
        test.deepEqual(config.cfg.temp_fail_intervals, [30,60,300,540,900,900,900,1800,1800,3600,3600,3600,7200,7200,7200,86400]);
        // Test the "none" configuration
        config.cfg.temp_fail_intervals = 'none';
        config.set_temp_fail_intervals();
        test.deepEqual(config.cfg.temp_fail_intervals, []);
        // Test bad config (should revert to default)
        config.cfg.temp_fail_intervals = '60 min';
        config.set_temp_fail_intervals();
        test.deepEqual(config.cfg.temp_fail_intervals, [64,128,256,512,1024,2048,4096,8192,16384,32768,65536,131072]);
        test.done();
    }
}

exports.qfile = {
    setUp (done) {
        this.qfile = require('../../outbound').qfile;
        done();
    },
    'name() basic functions' (test){
        test.expect(3);
        const name = this.qfile.name();
        const split = name.split('_');
        test.equal(split.length, 7);
        test.equal(split[2], 0);
        test.equal(split[3], process.pid);
        test.done();
    },
    'name() with overrides' (test){
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
    'rnd_unique() is unique-ish' (test){
        const repeats = 1000;
        test.expect(repeats);
        const u = this.qfile.rnd_unique();
        for (let i = 0; i < repeats; i++){
            test.notEqual(u, this.qfile.rnd_unique());
        }
        test.done();
    },
    'parts() updates previous queue filenames' (test){
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
    'parts() handles standard queue filenames' (test){
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
}

exports.get_tls_options = {
    setUp (done) {
        process.env.HARAKA_TEST_DIR=path.resolve('tests');
        this.outbound = require('../../outbound');
        this.obtls = require('../../outbound/tls');
        const tls_socket = require('../../tls_socket');

        // reset config to load from tests directory
        const testDir = path.resolve('tests');
        this.outbound.config = this.outbound.config.module_config(testDir);
        this.obtls.test_config(tls_socket.config.module_config(testDir), this.outbound.config);
        this.obtls.init(() => {
            done();
        })

    },
    tearDown: done => {
        delete process.env.HARAKA_TEST_DIR;
        done();
    },
    'gets TLS properties from tls.ini.outbound' (test) {
        test.expect(1);
        const tls_config = this.obtls.get_tls_options(
            { exchange: 'mail.example.com'}
        );

        test.deepEqual(tls_config, {
            servername: 'mail.example.com',
            key: fs.readFileSync(path.resolve('tests','config','outbound_tls_key.pem')),
            cert: fs.readFileSync(path.resolve('tests','config','outbound_tls_cert.pem')),
            dhparam: fs.readFileSync(path.resolve('tests','config','dhparams.pem')),
            ciphers: 'ECDHE-RSA-AES256-GCM-SHA384',
            minVersion: 'TLSv1',
            rejectUnauthorized: false,
            requestCert: false,
            honorCipherOrder: false,
            redis: { disable_for_failed_hosts: false },
            no_tls_hosts: [],
            force_tls_hosts: ['first.example.com', 'second.example.net']
        });
        test.done();
    },
}

exports.build_todo = {
    setUp (done) {
        this.outbound = require('../../outbound');
        try {
            fs.unlinkSync('tests/queue/multibyte');
            fs.unlinkSync('tests/queue/plain');
        }
        catch (ignore) {}
        done();
    },
    tearDown: done => {
        // fs.unlink('tests/queue/multibyte', done);
        done();
    },
    'saves a file' (test) {
        const todo = JSON.parse('{"queue_time":1507509981169,"domain":"redacteed.com","rcpt_to":[{"original":"<postmaster@redacteed.com>","original_host":"redacteed.com","host":"redacteed.com","user":"postmaster"}],"mail_from":{"original":"<matt@tnpi.net>","original_host":"tnpi.net","host":"tnpi.net","user":"matt"},"notes":{"authentication_results":["spf=pass smtp.mailfrom=tnpi.net"],"spf_mail_result":"Pass","spf_mail_record":"v=spf1 a mx include:mx.theartfarm.com ?include:forwards._spf.tnpi.net include:lists._spf.tnpi.net -all","attachment_count":0,"attachments":[{"ctype":"application/pdf","filename":"FileWithoutAccent Chars.pdf","extension":".pdf","md5":"6c1d5f5c047cff3f6320b1210970bdf6"}],"attachment_ctypes":["application/pdf","multipart/mixed","text/plain","application/pdf"],"attachment_files":["FileWithoutaccent Chars.pdf"],"attachment_archive_files":[]},"uuid":"1D5483B0-3E00-4280-A961-3AFD2017B4FC.1"}');
        const fd = fs.openSync('tests/queue/plain', 'w');
        const ws = new fs.createWriteStream('tests/queue/plain', { fd, flags: constants.WRITE_EXCL });
        ws.on('close', () => {
            // console.log(arguments);
            test.ok(1);
            test.done();
        })
        ws.on('error', (e) => {
            console.error(e);
            test.done();
        })
        this.outbound.build_todo(todo, ws, () => {
            ws.write(Buffer.from('This is the message body'));
            fs.fsync(fd, () => { ws.close(); })
        })
    },
    'saves a file with multibyte chars' (test) {
        const todo = JSON.parse('{"queue_time":1507509981169,"domain":"redacteed.com","rcpt_to":[{"original":"<postmaster@redacteed.com>","original_host":"redacteed.com","host":"redacteed.com","user":"postmaster"}],"mail_from":{"original":"<matt@tnpi.net>","original_host":"tnpi.net","host":"tnpi.net","user":"matt"},"notes":{"authentication_results":["spf=pass smtp.mailfrom=tnpi.net"],"spf_mail_result":"Pass","spf_mail_record":"v=spf1 a mx include:mx.theartfarm.com ?include:forwards._spf.tnpi.net include:lists._spf.tnpi.net -all","attachment_count":0,"attachments":[{"ctype":"application/pdf","filename":"FileWîthÁccent Chars.pdf","extension":".pdf","md5":"6c1d5f5c047cff3f6320b1210970bdf6"}],"attachment_ctypes":["application/pdf","multipart/mixed","text/plain","application/pdf"],"attachment_files":["FileWîthÁccent Chars.pdf"],"attachment_archive_files":[]},"uuid":"1D5483B0-3E00-4280-A961-3AFD2017B4FC.1"}');
        const fd = fs.openSync('tests/queue/multibyte', 'w');
        const ws = new fs.WriteStream('tests/queue/multibyte', { fd, flags: constants.WRITE_EXCL });
        ws.on('close', () => {
            test.ok(1);
            test.done();
        })
        ws.on('error', (e) => {
            console.error(e);
            test.done();
        })
        this.outbound.build_todo(todo, ws, () => {
            ws.write(Buffer.from('This is the message body'));
            fs.fsync(fd, () => { ws.close(); })
        })
    },
    // '': function (test) {

    //     test.done();
    // },
}

exports.timer_queue = {
    setUp (done) {
        process.env.HARAKA_TEST_DIR=path.resolve('tests');
        this.outbound = require('../../outbound');
        const TimerQueue = require('../../outbound/timer_queue');
        this.ob_timer_queue = new TimerQueue(500);
        done();
    },
    tearDown (done) {
        delete process.env.HARAKA_TEST_DIR;
        this.ob_timer_queue.shutdown();
        done();
    },
    'has initial length of 0' (test) {
        test.expect(1);

        const tq_length = this.ob_timer_queue.length();

        test.equal(tq_length, 0);
        test.done();
    },
    'can add items' (test) {
        test.expect(1);

        this.ob_timer_queue.add("1", 1000);
        this.ob_timer_queue.add("2", 2000);

        const tq_length = this.ob_timer_queue.length();

        test.equal(tq_length, 2);
        test.done();
    },
    'can drain items' (test) {
        test.expect(2);

        this.ob_timer_queue.add("1", 1000);
        this.ob_timer_queue.add("2", 2000);

        let tq_length = this.ob_timer_queue.length();

        test.equal(tq_length, 2);

        this.ob_timer_queue.drain();
        tq_length = this.ob_timer_queue.length();

        test.equal(tq_length, 0);

        test.done();
    },
    'can discard items by id' (test) {
        test.expect(3);

        this.ob_timer_queue.add("1", 1000);
        this.ob_timer_queue.add("2", 2000);

        let tq_length = this.ob_timer_queue.length();

        test.equal(tq_length, 2);

        this.ob_timer_queue.discard("2");
        tq_length = this.ob_timer_queue.length();

        test.equal(tq_length, 1);
        test.equal(this.ob_timer_queue.queue[0].id, "1");

        test.done();
    }
}
