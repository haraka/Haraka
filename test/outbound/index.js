'use strict'

const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const constants = require('haraka-constants')
const logger = require('../../logger')

const lines = [
    'From: John Johnson <john@example.com>',
    'To: Jane Johnson <jane@example.com>',
    "Subject: What's for dinner?",
    '',
    "I'm hungry.",
    '',
]

describe('outbound', () => {
    it('converts \\n and \\r\\n line endings to \\r\\n', () => {
        for (const ending of ['\n', '\r\n']) {
            let contents = lines.join(ending)
            let result = ''

            let match
            const re = /^([^\n]*\n?)/
            while ((match = re.exec(contents))) {
                let line = match[1]
                line = line.replace(/\r?\n?$/, '\r\n')
                result += line
                contents = contents.substring(match[1].length)
                if (contents.length === 0) break
            }

            assert.deepEqual(lines.join('\r\n'), result)
        }
    })

    it('log_methods added to HMailItem prototype', () => {
        const levels = ['DATA', 'PROTOCOL', 'DEBUG', 'INFO', 'NOTICE', 'WARN', 'ERROR', 'CRIT', 'ALERT', 'EMERG']
        // Load via outbound/index to avoid circular-dep boot-order issue
        const HMailItem = require('../../outbound').HMailItem
        for (const level of levels) {
            assert.ok(HMailItem.prototype[`log${level.toLowerCase()}`], `log method for ${level}`)
        }
    })

    it('set_temp_fail_intervals coverage', () => {
        const config = require('../../outbound/config')
        assert.deepEqual(
            config.cfg.temp_fail_intervals,
            [64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072],
        )

        config.cfg.temp_fail_intervals = '10s, 1m*2'
        config.set_temp_fail_intervals()
        assert.deepEqual(config.cfg.temp_fail_intervals, [10, 60, 60])

        config.cfg.temp_fail_intervals = '30s, 1m, 5m, 9m, 15m*3, 30m*2, 1h*3, 2h*3, 1d'
        config.set_temp_fail_intervals()
        assert.deepEqual(
            config.cfg.temp_fail_intervals,
            [30, 60, 300, 540, 900, 900, 900, 1800, 1800, 3600, 3600, 3600, 7200, 7200, 7200, 86400],
        )

        config.cfg.temp_fail_intervals = 'none'
        config.set_temp_fail_intervals()
        assert.deepEqual(config.cfg.temp_fail_intervals, [])

        config.cfg.temp_fail_intervals = '60 min'
        config.set_temp_fail_intervals()
        assert.deepEqual(
            config.cfg.temp_fail_intervals,
            [64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072],
        )
    })

    describe('get_tls_options', () => {
        let outbound, obtls

        beforeEach(async () => {
            process.env.HARAKA_TEST_DIR = path.resolve('test')
            outbound = require('../../outbound')
            obtls = require('../../outbound/tls')
            const tls_socket = require('../../tls_socket')

            const testDir = path.resolve('test')
            outbound.config = outbound.config.module_config(testDir)
            obtls.test_config(tls_socket.config.module_config(testDir), outbound.config)
            await new Promise((resolve) => obtls.init(resolve))
        })

        afterEach(() => {
            delete process.env.HARAKA_TEST_DIR
        })

        it('gets TLS properties from tls.ini.outbound', () => {
            const tls_config = obtls.get_tls_options({ exchange: 'mail.example.com' })
            assert.deepEqual(tls_config, {
                servername: 'mail.example.com',
                key: fs.readFileSync(path.resolve('test', 'config', 'outbound_tls_key.pem')),
                cert: fs.readFileSync(path.resolve('test', 'config', 'outbound_tls_cert.pem')),
                dhparam: fs.readFileSync(path.resolve('test', 'config', 'dhparams.pem')),
                ciphers: 'ECDHE-RSA-AES256-GCM-SHA384',
                minVersion: 'TLSv1',
                rejectUnauthorized: false,
                requestCert: false,
                honorCipherOrder: false,
                redis: { disable_for_failed_hosts: false },
                no_tls_hosts: ['127.0.0.2', '192.168.31.1/24'],
                force_tls_hosts: ['first.example.com', 'second.example.net'],
            })
        })
    })

    describe('build_todo', () => {
        let outbound

        beforeEach(() => {
            outbound = require('../../outbound')
            try {
                fs.unlinkSync('test/queue/multibyte')
                fs.unlinkSync('test/queue/plain')
            } catch (ignore) {}
        })

        it('saves a plain queue file', () => {
            const todo = JSON.parse(
                '{"queue_time":1507509981169,"domain":"redacteed.com","rcpt_to":[{"original":"<postmaster@redacteed.com>","original_host":"redacteed.com","host":"redacteed.com","user":"postmaster"}],"mail_from":{"original":"<matt@tnpi.net>","original_host":"tnpi.net","host":"tnpi.net","user":"matt"},"notes":{"authentication_results":["spf=pass smtp.mailfrom=tnpi.net"],"spf_mail_result":"Pass","spf_mail_record":"v=spf1 a mx include:mx.theartfarm.com ?include:forwards._spf.tnpi.net include:lists._spf.tnpi.net -all","attachment_count":0,"attachments":[{"ctype":"application/pdf","filename":"FileWithoutAccent Chars.pdf","extension":".pdf","md5":"6c1d5f5c047cff3f6320b1210970bdf6"}],"attachment_ctypes":["application/pdf","multipart/mixed","text/plain","application/pdf"],"attachment_files":["FileWithoutaccent Chars.pdf"],"attachment_archive_files":[]},"uuid":"1D5483B0-3E00-4280-A961-3AFD2017B4FC.1"}',
            )
            const fd = fs.openSync('test/queue/plain', 'w')
            const ws = new fs.createWriteStream('test/queue/plain', { fd, flags: constants.WRITE_EXCL })
            ws.on('error', (e) => console.error(e))
            outbound.build_todo(todo, ws, () => {
                ws.write(Buffer.from('This is the message body'))
                fs.fsync(fd, () => ws.close())
            })
            assert.ok(true)
        })

        it('saves a queue file with multibyte chars', () => {
            const todo = JSON.parse(
                '{"queue_time":1507509981169,"domain":"redacteed.com","rcpt_to":[{"original":"<postmaster@redacteed.com>","original_host":"redacteed.com","host":"redacteed.com","user":"postmaster"}],"mail_from":{"original":"<matt@tnpi.net>","original_host":"tnpi.net","host":"tnpi.net","user":"matt"},"notes":{"authentication_results":["spf=pass smtp.mailfrom=tnpi.net"],"spf_mail_result":"Pass","spf_mail_record":"v=spf1 a mx include:mx.theartfarm.com ?include:forwards._spf.tnpi.net include:lists._spf.tnpi.net -all","attachment_count":0,"attachments":[{"ctype":"application/pdf","filename":"FileW\\u00eeth\\u00c1ccent Chars.pdf","extension":".pdf","md5":"6c1d5f5c047cff3f6320b1210970bdf6"}],"attachment_ctypes":["application/pdf","multipart/mixed","text/plain","application/pdf"],"attachment_files":["FileW\\u00eeth\\u00c1ccent Chars.pdf"],"attachment_archive_files":[]},"uuid":"1D5483B0-3E00-4280-A961-3AFD2017B4FC.1"}',
            )
            const fd = fs.openSync('test/queue/multibyte', 'w')
            const ws = new fs.WriteStream('test/queue/multibyte', { fd, flags: constants.WRITE_EXCL })
            ws.on('error', (e) => console.error(e))
            outbound.build_todo(todo, ws, () => {
                ws.write(Buffer.from('This is the message body'))
                fs.fsync(fd, () => ws.close())
            })
            assert.ok(true)
        })

        it('waits for drain when stream backpressure is applied', async () => {
            const todo = {
                queue_time: Date.now(),
                domain: 'example.com',
                rcpt_to: [],
                mail_from: {},
                notes: {},
                uuid: 'u1',
            }
            let drained = false

            await new Promise((resolve) => {
                const ws = {
                    write() {
                        return false
                    },
                    once(event, cb) {
                        assert.equal(event, 'drain')
                        setImmediate(() => {
                            drained = true
                            cb()
                            resolve()
                        })
                    },
                }
                outbound.build_todo(todo, ws, () => {})
            })

            assert.equal(drained, true)
        })
    })

    describe('send_trans_email', () => {
        const queueDir = path.resolve('test', 'test-queue')

        beforeEach(() => {
            process.env.HARAKA_TEST_DIR = path.resolve('test')
            fs.mkdirSync(queueDir, { recursive: true })
        })

        afterEach(() => {
            delete process.env.HARAKA_TEST_DIR
            try {
                for (const f of fs.readdirSync(queueDir)) {
                    fs.unlinkSync(path.join(queueDir, f))
                }
            } catch (ignore) {}
        })

        // Regression test for haraka/Haraka#3551:
        // When dkim_verify (data_post) pipes the message_stream and DKIMVerifyStream
        // fires its callback early via process.nextTick (no DKIM-Signature found),
        // the chain runs synchronously into process_delivery → pipe() while the
        // first pipe is still in flight. pre_send_trans_email_respond must yield
        // (via setImmediate) before opening a new pipe.
        it('yields to setImmediate before opening process_delivery pipes', async () => {
            const stream = require('node:stream')
            const Transaction = require('../../transaction')
            const Address = require('../../address').Address
            const outbound = require('../../outbound')
            const plugins = require('../../plugins')

            const txn = Transaction.createTransaction()
            const origRunHooks = plugins.run_hooks
            try {
                txn.mail_from = new Address('<from@example.com>')
                txn.rcpt_to = [new Address('<to@example.com>')]
                txn.message_stream.add_line(Buffer.from('From: from@example.com\r\n'))
                txn.message_stream.add_line(Buffer.from('To: to@example.com\r\n'))
                txn.message_stream.add_line(Buffer.from('\r\n'))
                txn.message_stream.add_line(Buffer.from('body\r\n'))
                await new Promise((r) => txn.message_stream.add_line_end(r))

                // Start a pipe on the message_stream and fire a synchronous callback
                // before it drains — this models what dkim_verify does.
                const verifierFiredCb = new Promise((resolve) => {
                    let scheduled = false
                    const verifier = new stream.Writable({
                        write(_chunk, _enc, cb) {
                            if (!scheduled) {
                                scheduled = true
                                process.nextTick(resolve)
                            }
                            cb()
                        },
                    })
                    txn.message_stream.pipe(verifier)
                })
                await verifierFiredCb

                // Now invoke send_trans_email — its pre_send_trans_email_respond
                // should yield (await setImmediate) before calling process_delivery,
                // letting the verifier pipe drain so the new pipe can succeed.
                await new Promise((resolve, reject) => {
                    // Stub the heavy bits: we only care that the chain doesn't throw
                    // "Cannot pipe while currently piping" before queuing happens.
                    plugins.run_hooks = (hook, obj) => {
                        if (hook === 'pre_send_trans_email') {
                            // Mimic empty-hook synchronous callback (no plugins)
                            obj.pre_send_trans_email_respond(constants.cont).catch(reject)
                        } else {
                            origRunHooks.call(plugins, hook, obj)
                        }
                    }

                    outbound.send_trans_email(txn, (retval) => {
                        if (retval === constants.ok) resolve()
                        else reject(new Error(`unexpected retval ${retval}`))
                    })
                })
            } finally {
                plugins.run_hooks = origRunHooks
                txn.message_stream.destroy()
            }
        })

        it('adds missing Message-Id/Date and prepends Received before queueing', async () => {
            process.env.HARAKA_TEST_DIR = path.resolve('test')
            const Address = require('../../address').Address
            const outbound = require('../../outbound')
            const plugins = require('../../plugins')

            const added = []
            const leading = []
            const queued = []
            const transaction = {
                uuid: 'txn-add-headers',
                header: {
                    get_all(_name) {
                        return []
                    },
                    get() {
                        return null
                    },
                },
                rcpt_to: [new Address('<user@example.com>')],
                notes: {},
                add_header(name, value) {
                    added.push([name, value])
                },
                remove_header() {},
                add_leading_header(name, value) {
                    leading.push([name, value])
                },
                results: {
                    add() {},
                },
            }

            const originalRunHooks = plugins.run_hooks
            const originalProcessDelivery = outbound.process_delivery
            const originalPush = outbound.delivery_queue.push
            outbound.delivery_queue.push = (hmail) => {
                queued.push(hmail)
            }
            outbound.process_delivery = async (_okPaths, _todo, hmails) => {
                hmails.push({ queued: true })
            }
            plugins.run_hooks = (hook, conn) => {
                if (hook === 'pre_send_trans_email') {
                    conn.pre_send_trans_email_respond(constants.cont)
                }
            }

            try {
                const result = await new Promise((resolve) => {
                    outbound.send_trans_email(transaction, (retval, msg) => resolve({ retval, msg }))
                })

                assert.equal(result.retval, constants.ok)
                assert.match(result.msg, /Message Queued/)
                assert.equal(queued.length, 1)
                assert.equal(
                    added.some(([name]) => name === 'Message-Id'),
                    true,
                )
                assert.equal(
                    added.some(([name]) => name === 'Date'),
                    true,
                )
                assert.equal(leading[0][0], 'Received')
            } finally {
                plugins.run_hooks = originalRunHooks
                outbound.process_delivery = originalProcessDelivery
                outbound.delivery_queue.push = originalPush
                delete process.env.HARAKA_TEST_DIR
            }
        })
    })

    describe('timer_queue', () => {
        let outbound, ob_timer_queue

        beforeEach(() => {
            process.env.HARAKA_TEST_DIR = path.resolve('test')
            outbound = require('../../outbound')
            const TimerQueue = require('../../outbound/timer_queue')
            ob_timer_queue = new TimerQueue(500)
        })

        afterEach(() => {
            delete process.env.HARAKA_TEST_DIR
            ob_timer_queue.shutdown()
        })

        it('has initial length of 0', () => {
            assert.equal(ob_timer_queue.length(), 0)
        })

        it('can add items', () => {
            ob_timer_queue.add('1', 1000)
            ob_timer_queue.add('2', 2000)
            assert.equal(ob_timer_queue.length(), 2)
        })

        it('can drain items', () => {
            ob_timer_queue.add('1', 1000)
            ob_timer_queue.add('2', 2000)
            ob_timer_queue.drain()
            assert.equal(ob_timer_queue.length(), 0)
        })

        it('can discard items by id', () => {
            ob_timer_queue.add('1', 1000)
            ob_timer_queue.add('2', 2000)
            ob_timer_queue.discard('2')
            assert.equal(ob_timer_queue.length(), 1)
            assert.equal(ob_timer_queue.queue[0].id, '1')
        })
    })
})
