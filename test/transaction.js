'use strict'

const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const config = require('haraka-config')
const transaction = require('../transaction')

// ── Helpers ───────────────────────────────────────────────────────────────────

const endData = (txn) => new Promise((resolve) => txn.end_data(resolve))
const getData = (stream) => new Promise((resolve) => stream.get_data(resolve))

const setUp = () => {
    this.transaction = transaction.createTransaction(undefined, config.get('smtp.ini'))
}

function addLines(txn, lines) {
    for (const line of lines) txn.add_data(line)
}

function write_file_data_to_transaction(test_transaction, filename) {
    const specimen = fs.readFileSync(filename, 'utf8')
    const matcher = /[^\n]*([\n]|$)/g
    let line
    do {
        line = matcher.exec(specimen)
        if (line[0] === '') break
        test_transaction.add_data(line[0])
    } while (line[0] !== '')
    test_transaction.end_data()
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('transaction', () => {
    beforeEach(setUp)

    describe('createTransaction', () => {
        it('generates a UUID when none is provided', () => {
            const txn = transaction.createTransaction()
            assert.ok(txn.uuid, 'uuid is set')
            assert.match(txn.uuid, /^[0-9A-F-]+$/i, 'uuid looks like a UUID')
        })

        it('uses the provided UUID', () => {
            const txn = transaction.createTransaction('TEST-UUID')
            assert.equal(txn.uuid, 'TEST-UUID')
        })

        it('initialises header_pos to 0', () => {
            assert.equal(this.transaction.header_pos, 0)
        })

        it('initialises found_hb_sep to false', () => {
            assert.equal(this.transaction.found_hb_sep, false)
        })
    })

    describe('add_body_filter', () => {
        it('filter callback receives correct content-type, encoding, and body', async () => {
            let called = false
            this.transaction.add_body_filter('text/plain', (ct, enc, buf) => {
                assert.ok(ct.startsWith('text/plain'), 'correct content-type')
                assert.match(enc, /utf-?8/i, 'correct encoding')
                assert.equal(buf.toString().trim(), 'Text part', 'correct body text')
                called = true
            })
            addLines(this.transaction, [
                'Content-Type: multipart/alternative; boundary=abcd\n',
                '\n',
                '--abcd\n',
                'Content-Type: text/plain\n',
                '\n',
                'Text part\n',
                '--abcd\n',
                'Content-Type: text/html\n',
                '\n',
                '<p>HTML part</p>\n',
                '--abcd--\n',
            ])
            await endData(this.transaction)
            await getData(this.transaction.message_stream)
            assert.ok(called, 'filter was called')
        })

        // Issue #2290: add_body_filter called after ensure_body() has already run must still apply.
        it('filter applied when added after body already initialised', async () => {
            this.transaction.attachment_hooks(() => {})
            this.transaction.add_data('Content-Type: text/plain\n')
            this.transaction.add_data('\n')

            let filter_called = false
            this.transaction.add_body_filter('text/plain', (ct, enc, buf) => {
                filter_called = true
                return buf
            })

            this.transaction.add_data('Hello\n')
            await endData(this.transaction)
            await getData(this.transaction.message_stream)
            assert.ok(filter_called, 'filter called even when added after body init')
        })

        it('filter added after body init can transform content', async () => {
            this.transaction.attachment_hooks(() => {})
            this.transaction.add_data('Content-Type: text/plain\n')
            this.transaction.add_data('\n')

            this.transaction.add_body_filter('text/plain', (ct, enc, buf) => {
                return Buffer.from(buf.toString().replace('Hello', 'World'))
            })

            this.transaction.add_data('Hello\n')
            await endData(this.transaction)
            const body = await getData(this.transaction.message_stream)
            assert.ok(body.toString().includes('World'), 'filter transformed content')
            assert.ok(!body.toString().includes('Hello'), 'original content was replaced')
        })

        it('filter with regex ct_match fires on matching part', async () => {
            let matched_ct = null
            this.transaction.add_body_filter(/^text\//, (ct, enc, buf) => {
                matched_ct = ct
                return buf
            })
            addLines(this.transaction, [
                'Content-Type: multipart/alternative; boundary=X\n',
                '\n',
                '--X\n',
                'Content-Type: text/plain\n',
                '\n',
                'Plain\n',
                '--X--\n',
            ])
            await endData(this.transaction)
            await getData(this.transaction.message_stream)
            assert.ok(matched_ct && matched_ct.startsWith('text/'), 'regex matched content-type')
        })
    })

    describe('attachment_hooks', () => {
        it('sets parse_body to true', () => {
            assert.equal(this.transaction.parse_body, false)
            this.transaction.attachment_hooks(() => {})
            assert.equal(this.transaction.parse_body, true)
        })

        it('attachment_hooks before set_banner and add_body_filter all cooperate', async () => {
            this.transaction.attachment_hooks(() => {})
            this.transaction.set_banner('banner')
            let filter_called = false
            this.transaction.add_body_filter('', () => {
                filter_called = true
            })
            addLines(this.transaction, ['Content-Type: text/plain\n', '\n', 'Some text\n'])
            await endData(this.transaction)
            const body = await getData(this.transaction.message_stream)
            assert.ok(/banner$/.test(body.toString().trim()), 'banner applied')
            assert.ok(filter_called, 'body filter called')
        })
    })

    describe('set_banner', () => {
        it('appends text banner to plain-text body', async () => {
            this.transaction.set_banner('TEXT_BANNER', 'HTML_BANNER')
            addLines(this.transaction, ['Content-Type: text/plain\n', '\n', 'Hello\n'])
            await endData(this.transaction)
            const body = await getData(this.transaction.message_stream)
            assert.ok(body.toString().includes('TEXT_BANNER'), 'text banner present')
        })

        it('appends banners in nested MIME structure', async () => {
            this.transaction.set_banner('TEXT_BANNER', 'HTML_BANNER')
            addLines(this.transaction, [
                'Content-Type: multipart/mixed; boundary="TOP_LEVEL"\r\n',
                '\r\n',
                '--TOP_LEVEL\r\n',
                'Content-Type: multipart/alternative; boundary="INNER_LEVEL"\r\n',
                '\r\n',
                '--INNER_LEVEL\r\n',
                'Content-Type: text/plain; charset=us-ascii\r\n',
                '\r\n',
                'Hello, this is a text part\r\n',
                '--INNER_LEVEL\r\n',
                'Content-Type: text/html; charset=us-ascii\r\n',
                '\r\n',
                '<p>This is an html part</p>\r\n',
                '--INNER_LEVEL--\r\n',
                '--TOP_LEVEL--\r\n',
            ])
            await endData(this.transaction)
            const body = await getData(this.transaction.message_stream)
            const str = body.toString()
            assert.ok(/Hello, this is a text part/.test(str), 'text part present')
            assert.ok(/This is an html part/.test(str), 'html part present')
            assert.ok(/TEXT_BANNER/.test(str), 'text banner present')
            assert.ok(/HTML_BANNER/.test(str), 'html banner present')
        })
    })

    describe('encoding', () => {
        it('correct output when content is non-utf8 (#2176)', async () => {
            // Czech panagram in ISO-8859-2
            const message = Buffer.from([
                0x50, 0xf8, 0xed, 0x6c, 0x69, 0xb9, 0x20, 0xbe, 0x6c, 0x75, 0xbb, 0x6f, 0x76, 0xe8, 0x6b, 0xfd, 0x20,
                0x6b, 0xf9, 0xf2, 0xfa, 0xec, 0x6c, 0x20, 0xef, 0xe2, 0x62, 0x65, 0x6c, 0x73, 0x6b, 0xe9, 0x20, 0xf3,
                0x64, 0x79, 0x2e,
            ])
            this.transaction.parse_body = true
            this.transaction.attachment_hooks(() => {})
            addLines(this.transaction, [
                Buffer.from('Content-Type: text/plain; charset=iso-8859-2; format=flowed\n'),
                '\n',
                Buffer.from([...message, 0x0a]),
            ])
            await endData(this.transaction)
            const body = await getData(this.transaction.message_stream)
            assert.ok(body.includes(message), 'ISO-8859-2 content not damaged')
        })

        it('no munging of bytes when not parsing body', async () => {
            // Same Czech panagram — verifies raw pass-through
            const message = Buffer.from([
                0x50, 0xf8, 0xed, 0x6c, 0x69, 0xb9, 0x20, 0xbe, 0x6c, 0x75, 0xbb, 0x6f, 0x76, 0xe8, 0x6b, 0xfd, 0x20,
                0x6b, 0xf9, 0xf2, 0xfa, 0xec, 0x6c, 0x20, 0xef, 0xe2, 0x62, 0x65, 0x6c, 0x73, 0x6b, 0xe9, 0x20, 0xf3,
                0x64, 0x79, 0x2e, 0x0a,
            ])
            addLines(this.transaction, ['Content-Type: text/plain; charset=iso-8859-2; format=flowed\n', '\n', message])
            await endData(this.transaction)
            const body = await getData(this.transaction.message_stream)
            assert.ok(body.includes(message), 'raw bytes not damaged')
        })

        it('add_data auto-converts string input to Buffer', async () => {
            // The code path for string input (should never happen but is defensive)
            this.transaction.add_data('Subject: string-input\n')
            this.transaction.add_data('\n')
            this.transaction.add_data('body\n')
            await endData(this.transaction)
            const body = await getData(this.transaction.message_stream)
            assert.ok(body.toString().includes('string-input'), 'string input was processed')
        })
    })

    describe('base64 handling', () => {
        it('varied fold-lengths preserve data integrity', async () => {
            const parsed = {}
            const pendingStreams = []
            this.transaction.parse_body = true
            this.transaction.attachment_hooks((ct, filename, body, stream) => {
                pendingStreams.push(
                    new Promise((resolve) => {
                        let buf = Buffer.alloc(0)
                        stream.on('data', (d) => {
                            buf = Buffer.concat([buf, d])
                        })
                        stream.on('end', () => {
                            parsed[filename] = buf
                            resolve()
                        })
                    }),
                )
            })

            const specimen = path.join(__dirname, 'mail_specimen', 'varied-fold-lengths-preserve-data.txt')
            write_file_data_to_transaction(this.transaction, specimen)
            await Promise.all(pendingStreams)

            assert.equal(this.transaction.body.children.length, 6)

            let first = null
            for (const name in parsed) {
                first = first || parsed[name]
                assert.ok(first.equals(parsed[name]), `buffer for '${name}' matches the others`)
            }
        })

        it('base64 root HTML decodes correct byte count', () => {
            this.transaction.parse_body = true
            const specimen = path.join(__dirname, 'mail_specimen', 'base64-root-part.txt')
            write_file_data_to_transaction(this.transaction, specimen)
            assert.equal(this.transaction.body.bodytext.length, 425)
        })
    })

    describe('boundary marker corruption (#2244)', () => {
        it('boundary marker is intact after large folded To header', async () => {
            let buf = ''
            this.transaction.add_data('Content-Type: multipart/alternative; boundary=abcd\r\n')
            buf += 'Content-Type: multipart/alternative; boundary=abcd\r\n'
            this.transaction.add_data(
                'To: "User1_firstname_middlename_lastname" <user1_firstname_middlename_lastname@test.com>,\r\n',
            )
            buf += 'To: "User1_firstname_middlename_lastname" <user1_firstname_middlename_lastname@test.com>,\r\n'

            // Add enough continuation lines to exceed 64 KB
            for (let i = 0; i < 725; i++) {
                const line = ` "User${i}_fn_mn_ln" <user${i}_fn_mn_ln@test.com>,\r\n`
                this.transaction.add_data(line)
                buf += line
            }
            const last = ' "Final_User_fn_mn_ln" <final_user_fn_mn_ln@test.com>\r\n'
            this.transaction.add_data(last)
            buf += last
            this.transaction.add_data('Message-ID: <Boundary_Marker_Test>\r\n')
            buf += 'Message-ID: <Boundary_Marker_Test>\r\n'
            this.transaction.add_data('MIME-Version: 1.0\r\n')
            buf += 'MIME-Version: 1.0\r\n'
            this.transaction.add_data('Date: Wed, 1 Jun 2022 16:44:39 +0530\r\n')
            buf += 'Date: Wed, 1 Jun 2022 16:44:39 +0530\r\n'
            this.transaction.add_data('\r\n')
            buf += '\r\n'
            this.transaction.add_data('--abcd\r\n')
            buf += '--abcd\r\n'

            const rest = [
                'Content-Type: text/plain\r\n',
                '\r\n',
                'Text part\r\n',
                '--abcd\r\n',
                'Content-Type: text/html\r\n',
                '\r\n',
                '<p>HTML part</p>\r\n',
                '--abcd--\r\n',
            ]
            for (const line of rest) {
                this.transaction.add_data(line)
                buf += line
            }

            await endData(this.transaction)
            const body = await getData(this.transaction.message_stream)
            assert.ok(body.includes(Buffer.from(buf)), 'message not damaged')
        })
    })

    describe('remove_final_cr', () => {
        const cases = [
            { desc: 'empty buffer', input: '', expected: '' },
            { desc: 'single byte', input: 'a', expected: 'a' },
            { desc: 'CRLF ending stripped to LF', input: 'hello\r\n', expected: 'hello\n' },
            { desc: 'LF-only ending unchanged', input: 'hello\n', expected: 'hello\n' },
            { desc: 'no newline unchanged', input: 'hello', expected: 'hello' },
            { desc: 'string input', input: 'hello\r\n', expected: 'hello\n' },
        ]

        for (const { desc, input, expected } of cases) {
            it(desc, () => {
                const result = this.transaction.remove_final_cr(Buffer.from(input))
                assert.equal(result.toString(), expected)
            })
        }
    })

    describe('add_dot_stuffing_and_ensure_crlf_newlines', () => {
        const cases = [
            { desc: 'empty string', input: '', expected: '' },
            { desc: 'no dots or newlines', input: 'hello world', expected: 'hello world' },
            { desc: 'bare LF becomes CRLF', input: 'hello\n', expected: 'hello\r\n' },
            { desc: 'CRLF preserved', input: 'hello\r\n', expected: 'hello\r\n' },
            { desc: 'leading dot stuffed', input: '.hello\n', expected: '..hello\r\n' },
            { desc: 'mid-line dot not stuffed', input: 'hel.lo\n', expected: 'hel.lo\r\n' },
            { desc: 'multi-line with leading dots', input: 'a\n.b\n', expected: 'a\r\n..b\r\n' },
            { desc: 'dot after CRLF stuffed', input: 'a\r\n.b\n', expected: 'a\r\n..b\r\n' },
        ]

        for (const { desc, input, expected } of cases) {
            it(desc, () => {
                const result = this.transaction.add_dot_stuffing_and_ensure_crlf_newlines(Buffer.from(input))
                assert.equal(result.toString(), expected)
            })
        }
    })

    describe('header manipulation (post-data)', () => {
        it('add_header appends a header', async () => {
            addLines(this.transaction, ['Subject: original\n', '\n', 'body\n'])
            await endData(this.transaction)
            this.transaction.add_header('X-Test', 'added')
            assert.deepEqual(this.transaction.header.get_all('X-Test'), ['added'])
        })

        it('add_leading_header prepends a header', async () => {
            addLines(this.transaction, ['Subject: original\n', '\n', 'body\n'])
            await endData(this.transaction)
            this.transaction.add_leading_header('X-Lead', 'first')
            assert.deepEqual(this.transaction.header.get_all('X-Lead'), ['first'])
        })

        it('remove_header removes a header', async () => {
            addLines(this.transaction, ['X-Remove: gone\n', '\n', 'body\n'])
            await endData(this.transaction)
            this.transaction.remove_header('X-Remove')
            assert.equal(this.transaction.header.get_all('X-Remove').length, 0)
        })

        it('add_header appears in message stream output', async () => {
            addLines(this.transaction, ['Subject: original\n', '\n', 'body\n'])
            await endData(this.transaction)
            this.transaction.add_header('X-Added', 'yes')
            const output = (await getData(this.transaction.message_stream)).toString()
            assert.ok(output.includes('X-Added: yes'), 'added header in output')
        })

        it('remove_header absent from message stream output', async () => {
            // Keep Subject so header_list stays non-empty after removal; the
            // ctor-headers path then replaces raw headers, omitting X-Remove.
            addLines(this.transaction, ['Subject: Keep\n', 'X-Remove: gone\n', '\n', 'body\n'])
            await endData(this.transaction)
            this.transaction.remove_header('X-Remove')
            const output = (await getData(this.transaction.message_stream)).toString()
            assert.ok(output.includes('Subject: Keep'), 'non-removed header present')
            assert.ok(!output.includes('X-Remove'), 'removed header not in output')
        })

        it('folded continuation headers are merged into header_list', async () => {
            addLines(this.transaction, [
                'Subject: This is a very long\n',
                ' subject line\n',
                'From: foo@example.com\n',
                '\n',
                'body\n',
            ])
            await endData(this.transaction)
            assert.ok(this.transaction.header.get('Subject').includes('long'), 'folded subject parsed')
            assert.ok(this.transaction.header.get('From').includes('foo@example.com'), 'From parsed')
        })
    })

    describe('pre-data header modifications (e.g. hook_mail / hook_rcpt)', () => {
        it('add_header before data preserves all email headers', async () => {
            // Simulates record_envelope_addresses which calls add_header in hook_mail/hook_rcpt
            // before DATA is received. Must not corrupt header_pos.
            this.transaction.add_header('X-Envelope-From', 'sender@example.com')
            this.transaction.add_header('X-Envelope-To', 'rcpt@example.com')

            addLines(this.transaction, ['Subject: Test\r\n', 'From: sender@example.com\r\n', '\r\n', 'Body line 1\r\n'])
            await endData(this.transaction)

            const str = (await getData(this.transaction.message_stream)).toString()
            assert.ok(str.includes('Subject: Test'), 'Subject preserved')
            assert.ok(str.includes('From: sender@example.com'), 'From preserved')
            assert.ok(str.includes('X-Envelope-From: sender@example.com'), 'pre-data header present')
            assert.ok(str.includes('X-Envelope-To: rcpt@example.com'), 'pre-data header present')
            assert.ok(str.includes('Body line 1'), 'body present')
        })

        it('add_leading_header before data does not corrupt header_pos', async () => {
            this.transaction.add_leading_header('X-Early', 'value')

            addLines(this.transaction, ['Subject: Check\r\n', '\r\n', 'body\r\n'])
            await endData(this.transaction)

            const str = (await getData(this.transaction.message_stream)).toString()
            assert.ok(str.includes('Subject: Check'), 'Subject preserved after add_leading_header')
            assert.ok(str.includes('X-Early: value'), 'pre-data leading header present')
        })

        it('remove_header before data does not corrupt header_pos', async () => {
            // Calling remove_header before data arrives should be a no-op for header_pos
            this.transaction.remove_header('X-Nonexistent')

            addLines(this.transaction, ['Subject: Check\r\n', '\r\n', 'body\r\n'])
            await endData(this.transaction)

            const str = (await getData(this.transaction.message_stream)).toString()
            assert.ok(str.includes('Subject: Check'), 'Subject preserved after pre-data remove_header')
        })
    })

    describe('late header additions (post end_data)', () => {
        it('late add_header to busted email appears before body', async () => {
            addLines(this.transaction, ['Subject: Test\r\n', 'From: user@example.com\r\n', 'Body line 1\r\n'])
            await endData(this.transaction)
            this.transaction.add_header('X-Late', 'true')

            const str = (await getData(this.transaction.message_stream)).toString()
            assert.ok(str.includes('X-Late: true'), 'late header present')
            assert.ok(str.indexOf('X-Late: true') < str.indexOf('Body line 1'), 'late header before body')
        })

        it('late add_header to clean email appears before body', async () => {
            addLines(this.transaction, ['Subject: Clean\r\n', '\r\n', 'Body line 1\r\n'])
            await endData(this.transaction)
            this.transaction.add_header('X-Late', 'true')

            const str = (await getData(this.transaction.message_stream)).toString()
            assert.ok(str.includes('X-Late: true'), 'late header present')
            assert.ok(str.indexOf('X-Late: true') < str.indexOf('Body line 1'), 'late header before body')
        })
    })

    describe('incr_mime_count', () => {
        it('increments mime_part_count', () => {
            assert.equal(this.transaction.mime_part_count, 0)
            this.transaction.incr_mime_count()
            assert.equal(this.transaction.mime_part_count, 1)
            this.transaction.incr_mime_count()
            assert.equal(this.transaction.mime_part_count, 2)
        })
    })

    describe('discard_data', () => {
        it('end_data calls callback even when discard_data is true', async () => {
            this.transaction.discard_data = true
            addLines(this.transaction, ['Subject: test\n', '\n', 'body\n'])
            await endData(this.transaction) // resolves → callback was called
        })

        it('discard_data with broken email (no separator) calls callback', async () => {
            this.transaction.discard_data = true
            addLines(this.transaction, ['Subject: test\n', 'From: a@b.com\n', 'Body\n'])
            await endData(this.transaction)
        })
    })

    describe('busted email (no header/body separator)', () => {
        it('headers and body are extracted when separator is missing', async () => {
            addLines(this.transaction, ['Subject: test\n', 'From: a@b.com\n', 'Body line 1\n'])
            await endData(this.transaction)

            assert.equal(this.transaction.header.get('Subject').trim(), 'test')
            assert.equal(this.transaction.header.get('From').trim(), 'a@b.com')

            const str = (await getData(this.transaction.message_stream)).toString()
            assert.ok(str.includes('Subject: test'), 'Subject in output')
            assert.ok(str.includes('Body line 1'), 'Body in output')
        })

        it('late add_header to busted email ends up before body in output', async () => {
            addLines(this.transaction, ['Subject: Test\r\n', 'From: user@example.com\r\n', 'Body line 1\r\n'])
            await endData(this.transaction)
            this.transaction.add_header('X-Late', 'true')

            const str = (await getData(this.transaction.message_stream)).toString()
            assert.ok(str.includes('X-Late: true'), 'late header present')
            assert.ok(str.indexOf('X-Late: true') < str.indexOf('Body line 1'), 'late header before body')
        })
    })

    describe('parse_body enabled after separator', () => {
        it('does not throw when parse_body set true after separator seen', async () => {
            this.transaction.add_data('Subject: test\n')
            this.transaction.add_data('\n')
            this.transaction.parse_body = true
            assert.doesNotThrow(() => this.transaction.add_data('body line\n'))
            await endData(this.transaction)
            assert.ok(this.transaction.body, 'body was lazily created')
        })
    })
})
