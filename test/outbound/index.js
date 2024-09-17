'use strict';

const assert = require('node:assert')
const fs   = require('fs');
const path = require('path');

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

describe('outbound', () => {

    it('converts \\n and \\r\\n line endings to \\r\\n' , () => {

        for (const ending of ['\n', '\r\n']) {
            let contents = lines.join(ending);
            let result = '';

            // Set data_lines to lines in contents
            let match;
            const re = /^([^\n]*\n?)/;
            while ((match = re.exec(contents))) {
                let line = match[1];
                line = line.replace(/\r?\n?$/, '\r\n'); // assure \r\n ending
                result += line;
                contents = contents.substr(match[1].length);
                if (contents.length === 0) {
                    break;
                }
            }

            assert.deepEqual(lines.join('\r\n'), result);
        }
    })

    it('log_methods added', () => {
        const levels = ['DATA','PROTOCOL','DEBUG','INFO','NOTICE','WARN','ERROR','CRIT','ALERT','EMERG']

        const HMailItem = require('../../outbound/hmail');

        for (const level of levels) {
            assert.ok(HMailItem.prototype[`log${level.toLowerCase()}`], `Log method for level: ${level}`);
        }
    })

    it('set_temp_fail_intervals coverage', () => {

        const config = require('../../outbound/config');
        // Test default configuration
        assert.deepEqual(config.cfg.temp_fail_intervals, [64,128,256,512,1024,2048,4096,8192,16384,32768,65536,131072]);
        // Test a simple configuration
        config.cfg.temp_fail_intervals = '10s, 1m*2';
        config.set_temp_fail_intervals();
        assert.deepEqual(config.cfg.temp_fail_intervals, [10, 60, 60]);
        // Test a complex configuration
        config.cfg.temp_fail_intervals = '30s, 1m, 5m, 9m, 15m*3, 30m*2, 1h*3, 2h*3, 1d';
        config.set_temp_fail_intervals();
        assert.deepEqual(config.cfg.temp_fail_intervals, [30,60,300,540,900,900,900,1800,1800,3600,3600,3600,7200,7200,7200,86400]);
        // Test the "none" configuration
        config.cfg.temp_fail_intervals = 'none';
        config.set_temp_fail_intervals();
        assert.deepEqual(config.cfg.temp_fail_intervals, []);
        // Test bad config (should revert to default)
        config.cfg.temp_fail_intervals = '60 min';
        config.set_temp_fail_intervals();
        assert.deepEqual(config.cfg.temp_fail_intervals, [64,128,256,512,1024,2048,4096,8192,16384,32768,65536,131072]);
    })

    describe('get_tls_options', () => {
        beforeEach((done) => {
            process.env.HARAKA_TEST_DIR=path.resolve('test');
            this.outbound = require('../../outbound');
            this.obtls = require('../../outbound/tls');
            const tls_socket = require('../../tls_socket');

            // reset config to load from tests directory
            const testDir = path.resolve('test');
            this.outbound.config = this.outbound.config.module_config(testDir);
            this.obtls.test_config(tls_socket.config.module_config(testDir), this.outbound.config);
            this.obtls.init(done)
        })

        afterEach((done) => {
            delete process.env.HARAKA_TEST_DIR;
            done();
        })

        it('gets TLS properties from tls.ini.outbound', () => {
            const tls_config = this.obtls.get_tls_options(
                { exchange: 'mail.example.com'}
            );

            assert.deepEqual(tls_config, {
                servername: 'mail.example.com',
                key: fs.readFileSync(path.resolve('test','config','outbound_tls_key.pem')),
                cert: fs.readFileSync(path.resolve('test','config','outbound_tls_cert.pem')),
                dhparam: fs.readFileSync(path.resolve('test','config','dhparams.pem')),
                ciphers: 'ECDHE-RSA-AES256-GCM-SHA384',
                minVersion: 'TLSv1',
                rejectUnauthorized: false,
                requestCert: false,
                honorCipherOrder: false,
                redis: { disable_for_failed_hosts: false },
                no_tls_hosts: ['127.0.0.2', '192.168.31.1/24'],
                force_tls_hosts: ['first.example.com', 'second.example.net']
            })
        })
    })

    describe('build_todo', () => {
        beforeEach((done) => {
            this.outbound = require('../../outbound');
            try {
                fs.unlinkSync('test/queue/multibyte');
                fs.unlinkSync('test/queue/plain');
            }
            catch (ignore) {}
            done();
        })

        it('saves a file', () => {
            const todo = JSON.parse('{"queue_time":1507509981169,"domain":"redacteed.com","rcpt_to":[{"original":"<postmaster@redacteed.com>","original_host":"redacteed.com","host":"redacteed.com","user":"postmaster"}],"mail_from":{"original":"<matt@tnpi.net>","original_host":"tnpi.net","host":"tnpi.net","user":"matt"},"notes":{"authentication_results":["spf=pass smtp.mailfrom=tnpi.net"],"spf_mail_result":"Pass","spf_mail_record":"v=spf1 a mx include:mx.theartfarm.com ?include:forwards._spf.tnpi.net include:lists._spf.tnpi.net -all","attachment_count":0,"attachments":[{"ctype":"application/pdf","filename":"FileWithoutAccent Chars.pdf","extension":".pdf","md5":"6c1d5f5c047cff3f6320b1210970bdf6"}],"attachment_ctypes":["application/pdf","multipart/mixed","text/plain","application/pdf"],"attachment_files":["FileWithoutaccent Chars.pdf"],"attachment_archive_files":[]},"uuid":"1D5483B0-3E00-4280-A961-3AFD2017B4FC.1"}');
            const fd = fs.openSync('test/queue/plain', 'w');
            const ws = new fs.createWriteStream('test/queue/plain', { fd, flags: constants.WRITE_EXCL });
            ws.on('close', () => {
                // console.log(arguments);
                assert.ok(1);
            })
            ws.on('error', (e) => {
                console.error(e);
            })
            this.outbound.build_todo(todo, ws, () => {
                ws.write(Buffer.from('This is the message body'));
                fs.fsync(fd, () => { ws.close(); })
            })
        })

        it('saves a file with multibyte chars', () => {
            const todo = JSON.parse('{"queue_time":1507509981169,"domain":"redacteed.com","rcpt_to":[{"original":"<postmaster@redacteed.com>","original_host":"redacteed.com","host":"redacteed.com","user":"postmaster"}],"mail_from":{"original":"<matt@tnpi.net>","original_host":"tnpi.net","host":"tnpi.net","user":"matt"},"notes":{"authentication_results":["spf=pass smtp.mailfrom=tnpi.net"],"spf_mail_result":"Pass","spf_mail_record":"v=spf1 a mx include:mx.theartfarm.com ?include:forwards._spf.tnpi.net include:lists._spf.tnpi.net -all","attachment_count":0,"attachments":[{"ctype":"application/pdf","filename":"FileWîthÁccent Chars.pdf","extension":".pdf","md5":"6c1d5f5c047cff3f6320b1210970bdf6"}],"attachment_ctypes":["application/pdf","multipart/mixed","text/plain","application/pdf"],"attachment_files":["FileWîthÁccent Chars.pdf"],"attachment_archive_files":[]},"uuid":"1D5483B0-3E00-4280-A961-3AFD2017B4FC.1"}');
            const fd = fs.openSync('test/queue/multibyte', 'w');
            const ws = new fs.WriteStream('test/queue/multibyte', { fd, flags: constants.WRITE_EXCL });
            ws.on('close', () => {
                assert.ok(1);
            })
            ws.on('error', (e) => {
                console.error(e);
            })
            this.outbound.build_todo(todo, ws, () => {
                ws.write(Buffer.from('This is the message body'));
                fs.fsync(fd, () => { ws.close(); })
            })
        })
    })

    describe('timer_queue', () => {
        beforeEach((done) => {
            process.env.HARAKA_TEST_DIR=path.resolve('test');
            this.outbound = require('../../outbound');
            const TimerQueue = require('../../outbound/timer_queue');
            this.ob_timer_queue = new TimerQueue(500);
            done();
        })

        afterEach((done) => {
            delete process.env.HARAKA_TEST_DIR;
            this.ob_timer_queue.shutdown();
            done()
        })

        it('has initial length of 0', () => {
            assert.equal(this.ob_timer_queue.length(), 0);
        })

        it('can add items', () => {
            this.ob_timer_queue.add("1", 1000);
            this.ob_timer_queue.add("2", 2000);

            assert.equal(this.ob_timer_queue.length(), 2);
        })

        it('can drain items', () => {

            this.ob_timer_queue.add("1", 1000);
            this.ob_timer_queue.add("2", 2000);

            let tq_length = this.ob_timer_queue.length();

            assert.equal(tq_length, 2);

            this.ob_timer_queue.drain();
            tq_length = this.ob_timer_queue.length();

            assert.equal(tq_length, 0);
        })

        it('can discard items by id', () => {

            this.ob_timer_queue.add("1", 1000);
            this.ob_timer_queue.add("2", 2000);

            let tq_length = this.ob_timer_queue.length();

            assert.equal(tq_length, 2);

            this.ob_timer_queue.discard("2");
            tq_length = this.ob_timer_queue.length();

            assert.equal(tq_length, 1);
            assert.equal(this.ob_timer_queue.queue[0].id, "1");
        })
    })
})
