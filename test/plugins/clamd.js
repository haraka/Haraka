'use strict';
const assert = require('node:assert')
const net = require('node:net');

const fixtures = require('haraka-test-fixtures');

const _set_up = (done) => {

    this.plugin = new fixtures.plugin('clamd');
    this.plugin.register();

    this.connection = fixtures.connection.createConnection();
    this.connection.init_transaction();

    done();
}

describe('plugins/clamd', () => {

    describe('load_clamd_ini', () => {
        beforeEach(_set_up)

        it('none', () => {
            assert.deepEqual([], this.plugin.skip_list);
        })

        it('defaults', () => {
            const cfg = this.plugin.cfg.main;
            assert.equal('localhost:3310', cfg.clamd_socket);
            assert.equal(30, cfg.timeout);
            assert.equal(10, cfg.connect_timeout);
            assert.equal(26214400, cfg.max_size);
            assert.equal(false, cfg.only_with_attachments);
            assert.equal(false, cfg.randomize_host_order);
        })

        it('reject opts', () => {
            assert.equal(true, this.plugin.rejectRE.test('Encrypted.'));
            assert.equal(true, this.plugin.rejectRE.test('Heuristics.Structured.'));
            assert.equal(true, this.plugin.rejectRE.test(
                'Heuristics.Structured.CreditCardNumber'));
            assert.equal(true, this.plugin.rejectRE.test('Broken.Executable.'));
            assert.equal(true, this.plugin.rejectRE.test('PUA.'));
            assert.equal(true, this.plugin.rejectRE.test(
                'Heuristics.OLE2.ContainsMacros'));
            assert.equal(true, this.plugin.rejectRE.test('Heuristics.Safebrowsing.'));
            assert.equal(true, this.plugin.rejectRE.test(
                'Heuristics.Safebrowsing.Suspected-phishing_safebrowsing.clamav.net'));
            assert.equal(true, this.plugin.rejectRE.test(
                'Sanesecurity.Junk.50402.UNOFFICIAL'));
            assert.equal(false, this.plugin.rejectRE.test(
                'Sanesecurity.UNOFFICIAL.oops'));
            assert.equal(false, this.plugin.rejectRE.test('Phishing'));
            assert.equal(false, this.plugin.rejectRE.test(
                'Heuristics.Phishing.Email.SpoofedDomain'));
            assert.equal(false, this.plugin.rejectRE.test('Suspect.Executable'));
            assert.equal(false, this.plugin.rejectRE.test('MattWuzHere'));
        })
    })

    describe('hook_data', () => {
        beforeEach(_set_up)

        it('only_with_attachments, false', (done) => {
            assert.equal(false, this.plugin.cfg.main.only_with_attachments);
            this.plugin.hook_data(() => {
                assert.equal(false, this.connection.transaction.parse_body);
                done();
            }, this.connection);
        })

        it('only_with_attachments, true', (done) => {
            this.plugin.cfg.main.only_with_attachments=true;
            this.connection.transaction.attachment_hooks = () => {};
            this.plugin.hook_data(() => {
                assert.equal(true, this.plugin.cfg.main.only_with_attachments);
                assert.equal(true, this.connection.transaction.parse_body);
                done();
            }, this.connection);
        })
    })

    describe('hook_data_post', () => {
        beforeEach(_set_up)

        it('skip attachment', (done) => {
            this.connection.transaction.notes = { clamd_found_attachment: false };
            this.plugin.cfg.main.only_with_attachments=true;
            this.plugin.hook_data_post(() => {
                assert.ok(this.connection.transaction.results.get('clamd').skip.length > 0);
                done();
            }, this.connection);
        })

        it('skip authenticated', (done) => {
            this.connection.notes.auth_user = 'user';
            this.plugin.cfg.check.authenticated = false;
            this.plugin.hook_data_post(() => {
                assert.ok(this.connection.transaction.results.get('clamd').skip.length > 0);
                done();
            }, this.connection);
        })

        it('checks local IP', (done) => {
            this.connection.remote.is_local = true;
            this.plugin.cfg.check.local_ip = true;
            this.plugin.hook_data_post(() => {
                assert.ok(this.connection.transaction.results.get('clamd').skip.length === 0);
                done();
            }, this.connection);
        })

        it('skips local IP', (done) => {
            this.connection.remote.is_local = true;
            this.plugin.cfg.check.local_ip = false;
            this.plugin.hook_data_post(() => {
                assert.ok(this.connection.transaction.results.get('clamd').skip.length > 0);
                done();
            }, this.connection);
        })

        it('checks private IP', (done) => {
            this.connection.remote.is_private = true;
            this.plugin.cfg.check.private_ip = true;
            this.plugin.hook_data_post(() => {
                assert.ok(this.connection.transaction.results.get('clamd').skip.length === 0);
                done();
            }, this.connection);
        })

        it('skips private IP', (done) => {
            this.connection.remote.is_private = true;
            this.plugin.cfg.check.private_ip = false;
            this.plugin.hook_data_post(() => {
                assert.ok(this.connection.transaction.results.get('clamd').skip.length > 0);
                done();
            }, this.connection);
        })

        it('checks public ip', (done) => {
            this.plugin.hook_data_post(() => {
                assert.ok(this.connection.transaction.results.get('clamd').skip.length === 0);
                done();
            }, this.connection);
        })

        it('skip localhost if check.local_ip = false and check.private_ip = true', (done) => {
            this.connection.remote.is_local = true;
            this.connection.remote.is_private = true;

            this.plugin.cfg.check.local_ip = false;
            this.plugin.cfg.check.private_ip = true;
            
            this.plugin.hook_data_post(() => {
                assert.ok(this.connection.transaction.results.get('clamd').skip.length > 0);
                done();
            }, this.connection);
        })

        it('checks localhost if check.local_ip = true and check.private_ip = false', (done) => {
            this.connection.remote.is_local = true;
            this.connection.remote.is_private = true;

            this.plugin.cfg.check.local_ip = true;
            this.plugin.cfg.check.private_ip = false;

            this.plugin.hook_data_post(() => {
                assert.ok(this.connection.transaction.results.get('clamd').skip.length === 0);
                done();
            }, this.connection);
        })

        it('message too big', (done) => {
            this.connection.transaction.data_bytes=513;
            this.plugin.cfg.main.max_size=512;
            
            this.plugin.hook_data_post(() => {
                assert.ok(this.connection.transaction.results.get('clamd').skip.length > 0);
                done();
            }, this.connection);
        })
    })

    describe('send_clamd_predata', () => {
        beforeEach(_set_up)

        it('writes the proper commands to clamd socket', (done) => {
            const server = new net.createServer((socket) => {
                socket.on('data', (data) => {
                    assert.ok(data.toString(), `zINSTREAM\0Received: from Haraka clamd plugin\r\n`)
                    // console.log(`${data.toString()}`)
                })
                socket.on('end', () => {
                    done()
                })
            })

            server.listen(65535, () => {
                const client = new net.Socket();
                client.connect(65535, () => {
                    this.plugin.send_clamd_predata(client, () => {
                        client.end()
                    })
                })
            })
        })
    })
})
