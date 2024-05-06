const assert = require('node:assert')
const path = require('node:path');

const fixtures = require('haraka-test-fixtures');
const message = require('haraka-email-message')

const smtp_client = require('../smtp_client');
const test_socket = require('./fixtures/line_socket')

function getClientOpts (socket) {
    return { port: 25, host: 'localhost', connect_timeout: 30, idle_timeout: 30, socket }
}

describe('smtp_client', () => {

    it('testUpgradeIsCalledOnSTARTTLS', () => {

        const plugin = new fixtures.plugin('queue/smtp_forward');

        // switch config directory to 'test/config'
        plugin.config = plugin.config.module_config(path.resolve('test'));

        plugin.register();

        const cmds = {};
        let upgradeArgs = {};

        const socket = {
            setTimeout: arg => {  },
            setKeepAlive: arg => {  },
            on: (eventName, callback) => {
                cmds[eventName] = callback;
            },
            upgrade: arg => {
                upgradeArgs = arg;
            }
        }

        const client = new smtp_client.smtp_client(getClientOpts(socket));
        client.load_tls_config({ key: Buffer.from('OutboundTlsKeyLoaded')});

        client.command = 'starttls';
        cmds.line('250 Hello client.example.com\r\n');

        const { StringDecoder } = require('string_decoder');
        const decoder = new StringDecoder('utf8');

        const cent = Buffer.from(upgradeArgs.key);
        assert.equal(decoder.write(cent), 'OutboundTlsKeyLoaded');
    })

    it('startTLS', () => {

        let cmd = '';

        const socket = {
            setTimeout: arg => {  },
            setKeepAlive: arg => {  },
            on: (eventName, callback) => {  },
            upgrade: arg => {  },
            write: arg => { cmd = arg; }
        };

        const client = new smtp_client.smtp_client(getClientOpts(socket));
        client.tls_options = {};

        client.secured = false;
        client.response = [ 'STARTTLS' ]

        smtp_client.onCapabilitiesOutbound(client, false, undefined, { 'enable_tls': true });

        assert.equal(cmd, 'STARTTLS\r\n');
    })

    describe('auth', () => {

        beforeEach((done) => {
            smtp_client.get_client({ notes: {}}, (client) => {
                this.client = client
                done()
            },
            {
                socket: test_socket.connect(),
            }
            )
        })

        it('authenticates during SMTP conversation', (done) => {

            const message_stream = new message.stream(
                { main : { spool_after : 1024 } }, "123456789"
            );

            const data = [];
            let reading_body = false;
            data.push('220 hi');

            this.client.on('greeting', command => {
                assert.equal(this.client.response[0], 'hi');
                assert.equal('EHLO', command);
                this.client.send_command(command, 'example.com');
            });

            data.push('EHLO example.com');
            data.push('250 hello');

            this.client.on('helo', () => {
                assert.equal(this.client.response[0], 'hello');
                this.client.send_command('AUTH', 'PLAIN AHRlc3QAdGVzdHBhc3M=');
                this.client.send_command('MAIL', 'FROM: me@example.com');
            });

            data.push('AUTH PLAIN AHRlc3QAdGVzdHBhc3M='); // test/testpass
            data.push('235 Authentication successful.');

            data.push('MAIL FROM: me@example.com');
            data.push('250 sender ok');

            this.client.on('mail', () => {
                assert.equal(this.client.response[0], 'sender ok');
                this.client.send_command('RCPT', 'TO: you@example.com');
            });

            data.push('RCPT TO: you@example.com');
            data.push('250 recipient ok');

            this.client.on('rcpt', () => {
                assert.equal(this.client.response[0], 'recipient ok');
                this.client.send_command('DATA');
            });

            data.push('DATA');
            data.push('354 go ahead');

            this.client.on('data', () => {
                assert.equal(this.client.response[0], 'go ahead');
                this.client.start_data(message_stream);
                message_stream.on('end', () => {
                    this.client.socket.write('.\r\n');
                });
                message_stream.add_line('Header: test\r\n');
                message_stream.add_line('\r\n');
                message_stream.add_line('hi\r\n');
                message_stream.add_line_end();
            });

            data.push('.');
            data.push('250 message queued');

            this.client.on('dot', () => {
                assert.equal(this.client.response[0], 'message queued');
                this.client.send_command('QUIT');
            });

            data.push('QUIT');
            data.push('221 goodbye');

            this.client.on('quit', () => {
                assert.equal(this.client.response[0], 'goodbye');
                done()
            });

            this.client.socket.write = function (line) {
                if (data.length == 0) {
                    assert.ok(false);
                    return;
                }
                assert.equal(`${data.shift()}\r\n`, line);
                if (reading_body && line == '.\r\n') {
                    reading_body = false;
                }
                if (!reading_body) {
                    if (line == 'DATA\r\n') {
                        reading_body = true;
                    }
                    while (true) {
                        const line2 = data.shift();
                        this.emit('line', `${line2}\r\n`);
                        if (line2[3] == ' ') break;
                    }
                }

                return true;
            };

            this.client.socket.emit('line', data.shift());
        })
    })

    describe('basic', () => {

        beforeEach((done) => {
            smtp_client.get_client({notes: {}}, (client) => {
                this.client = client
                done()
            },
            {
                socket: test_socket.connect(),
            })
        })

        it('conducts a SMTP session', (done) => {

            const message_stream = new message.stream(
                { main : { spool_after : 1024 } }, '123456789'
            );

            const data = [];
            let reading_body = false;
            data.push('220 hi');

            this.client.on('greeting', command => {
                assert.equal(this.client.response[0], 'hi');
                assert.equal('EHLO', command);
                this.client.send_command(command, 'example.com');
            });

            data.push('EHLO example.com');
            data.push('250 hello');

            this.client.on('helo', () => {
                assert.equal(this.client.response[0], 'hello');
                this.client.send_command('MAIL', 'FROM: me@example.com');
            });

            data.push('MAIL FROM: me@example.com');
            data.push('250 sender ok');

            this.client.on('mail', () => {
                assert.equal(this.client.response[0], 'sender ok');
                this.client.send_command('RCPT', 'TO: you@example.com');
            });

            data.push('RCPT TO: you@example.com');
            data.push('250 recipient ok');

            this.client.on('rcpt', () => {
                assert.equal(this.client.response[0], 'recipient ok');
                this.client.send_command('DATA');
            });

            data.push('DATA');
            data.push('354 go ahead');

            this.client.on('data', () => {
                assert.equal(this.client.response[0], 'go ahead');
                this.client.start_data(message_stream);
                message_stream.on('end', () => {
                    this.client.socket.write('.\r\n');
                });
                message_stream.add_line('Header: test\r\n');
                message_stream.add_line('\r\n');
                message_stream.add_line('hi\r\n');
                message_stream.add_line_end();
            });

            data.push('.');
            data.push('250 message queued');

            this.client.on('dot', () => {
                assert.equal(this.client.response[0], 'message queued');
                this.client.send_command('QUIT');
            });

            data.push('QUIT');
            data.push('221 goodbye');

            this.client.on('quit', () => {
                assert.equal(this.client.response[0], 'goodbye');
                done()
            });

            this.client.socket.write = function (line) {
                if (data.length == 0) {
                    assert.ok(false);
                    return;
                }
                assert.equal(`${data.shift()  }\r\n`, line);
                if (reading_body && line == '.\r\n') {
                    reading_body = false;
                }
                if (reading_body) return true;

                if (line == 'DATA\r\n') {
                    reading_body = true;
                }
                while (true) {
                    const line2 = data.shift();
                    this.emit('line', `${line2  }\r\n`);
                    if (line2[3] == ' ') break;
                }

                return true;
            };

            this.client.socket.emit('line', data.shift());
        })
    })
})
