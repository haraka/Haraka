
const assert = require('node:assert')

const constants    = require('haraka-constants');
const DSN          = require('haraka-dsn')

const connection   = require('../connection');
const Server       = require('../server');

// hack alert, but plugin tests need constants
constants.import(global);

const _set_up = (done) => {
    this.backup = {};
    const client = {
        remotePort: null,
        remoteAddress: null,
        destroy: () => { true; },
    };
    const server = {
        ip_address: null,
        address () {
            return this.ip_address;
        }
    }
    this.connection = connection.createConnection(client, server, Server.cfg);
    done()
}

describe('connection', () => {

    describe('connectionRaw', () => {
        beforeEach(_set_up)

        it('has remote object', () => {
            assert.deepEqual(this.connection.remote, {
                ip: null,
                port: null,
                host: null,
                info: null,
                closed: false,
                is_private: false,
                is_local: false
            });
        })

        it('has local object', () => {
            assert.equal(this.connection.local.ip, null);
            assert.equal(this.connection.local.port, null);
            assert.ok(this.connection.local.host, this.connection.local.host);
        })

        it('has tls object', () => {
            assert.deepEqual(this.connection.tls, {
                enabled: false,
                advertised: false,
                verified: false,
                cipher: {},
            });
        })

        it('get_capabilities', () => {
            assert.deepEqual([], this.connection.get_capabilities());
        })

        it('queue_msg, defined', () => {
            assert.equal(
                'test message',
                this.connection.queue_msg(1, 'test message')
            );
        })

        it('queue_msg, default deny', () => {
            assert.equal(
                'Message denied',
                this.connection.queue_msg(DENY)
            );
            assert.equal(
                'Message denied',
                this.connection.queue_msg(DENYDISCONNECT)
            );
        })

        it('queue_msg, default denysoft', () => {
            assert.equal(
                'Message denied temporarily',
                this.connection.queue_msg(DENYSOFT)
            );
            assert.equal(
                'Message denied temporarily',
                this.connection.queue_msg(DENYSOFTDISCONNECT)
            );
        })

        it('queue_msg, default else', () => {
            assert.equal('', this.connection.queue_msg('hello'));
        })

        it('has normalized connection properties', () => {
            this.connection.set('remote', 'ip', '172.16.15.1');
            this.connection.set('hello', 'verb', 'EHLO');
            this.connection.set('tls', 'enabled', true);

            assert.equal('172.16.15.1', this.connection.remote.ip);
            assert.equal(null, this.connection.remote.port);
            assert.equal('EHLO', this.connection.hello.verb);
            assert.equal(null, this.connection.hello.host);
            assert.equal(true, this.connection.tls.enabled);
        })

        it('sets remote.is_private and remote.is_local', () => {
            assert.equal(false, this.connection.remote.is_private);
            assert.equal(false, this.connection.remote.is_local);
        })

        it('has normalized proxy properties, default', () => {
            assert.equal(false, this.connection.proxy.allowed);
            assert.equal(null, this.connection.proxy.ip);
            assert.equal(null, this.connection.proxy.type);
            assert.equal(null, this.connection.proxy.timer);
        })

        it('has normalized proxy properties, set', () => {
            this.connection.set('proxy', 'ip', '172.16.15.1');
            this.connection.set('proxy', 'type', 'haproxy');
            this.connection.set('proxy', 'timer', setTimeout(() => {}, 1000));
            this.connection.set('proxy', 'allowed', true);

            assert.equal(true, this.connection.proxy.allowed);
            assert.equal('172.16.15.1', this.connection.proxy.ip);
            assert.ok(this.connection.proxy.timer);
            assert.equal(this.connection.proxy.type, 'haproxy');
        })
    })

    describe('connectionPrivate', () => {
        beforeEach((done) => {
            this.backup = {};
            const client = {
                remotePort: 2525,
                remoteAddress: '172.16.15.1',
                localPort: 25,
                localAddress: '172.16.15.254',
                destroy: () => { true; },
            };
            const server = {
                ip_address: '172.16.15.254',
                address () {
                    return this.ip_address;
                }
            }
            this.connection = connection.createConnection(client, server, Server.cfg);
            done()
        })

        it('sets remote.is_private and remote.is_local', () => {
            assert.equal(true, this.connection.remote.is_private);
            assert.equal(false, this.connection.remote.is_local);
            assert.equal(2525, this.connection.remote.port);
        })
    })


    describe('connectionLocal', () => {
        beforeEach((done) => {
            const client = {
                remotePort: 2525,
                remoteAddress: '127.0.0.2',
                localPort: 25,
                localAddress: '172.0.0.1',
                destroy: () => { true; },
            };
            const server = {
                ip_address: '127.0.0.1',
                address () {
                    return this.ip_address;
                }
            };
            this.connection = connection.createConnection(client, server, Server.cfg);
            done();
        })

        it('sets remote.is_private and remote.is_local', () => {
            assert.equal(true, this.connection.remote.is_private);
            assert.equal(true, this.connection.remote.is_local);
            assert.equal(2525, this.connection.remote.port);
        })
    })


    describe('get_remote', () => {
        beforeEach(_set_up)

        it('valid hostname', () => {
            this.connection.remote.host='a.host.tld'
            this.connection.remote.ip='172.16.199.198'
            assert.equal(this.connection.get_remote('host'), 'a.host.tld [172.16.199.198]');
        })

        it('no hostname', () => {
            this.connection.remote.ip='172.16.199.198'
            assert.equal(this.connection.get_remote('host'), '[172.16.199.198]');
        })

        it('DNSERROR', () => {
            this.connection.remote.host='DNSERROR'
            this.connection.remote.ip='172.16.199.198'
            assert.equal(this.connection.get_remote('host'), '[172.16.199.198]');
        })

        it('NXDOMAIN', () => {
            this.connection.remote.host='NXDOMAIN'
            this.connection.remote.ip='172.16.199.198'
            assert.equal(this.connection.get_remote('host'), '[172.16.199.198]');
        })

    })

    describe('local.info', () => {
        beforeEach(_set_up)

        it('is Haraka/version', () => {
            assert.ok(/Haraka\/\d.\d/.test(this.connection.local.info), this.connection.local.info);
        })
    })

    describe('relaying', () => {
        beforeEach(_set_up)

        it('sets and gets', () => {
            assert.equal(this.connection.relaying, false);
            assert.ok(this.connection.relaying = 'alligators');
            assert.equal(this.connection.relaying, 'alligators');
        })

        it('sets and gets in a transaction', () => {
            assert.equal(this.connection.relaying, false);
            this.connection.transaction = {};
            assert.ok(this.connection.relaying = 'crocodiles');
            assert.equal(this.connection.transaction._relaying, 'crocodiles');
            assert.equal(this.connection.relaying, 'crocodiles');
        })
    })

    describe('get_set', () => {
        beforeEach(_set_up)

        it('sets single level properties', () => {
            this.connection.set('encoding', true);
            assert.ok(this.connection.encoding);
            assert.ok(this.connection.get('encoding'));
        })

        it('sets two level deep properties', () => {
            this.connection.set('local.host', 'test');
            assert.equal(this.connection.local.host, 'test');
            assert.equal(this.connection.get('local.host'), 'test');
        })

        it('sets three level deep properties', () => {
            this.connection.set('some.fine.example', true);
            assert.ok(this.connection.some.fine.example);
            assert.ok(this.connection.get('some.fine.example'));
        })
    })

    describe('respond', () => {
        beforeEach(_set_up)

        it('disconnected returns undefined', () => {
            this.connection.state = constants.connection.state.DISCONNECTED
            assert.equal(this.connection.respond(200, 'your lucky day'), undefined);
            assert.equal(this.connection.respond(550, 'you are jacked'), undefined);
        })

        it('state=command, 200', () => {
            assert.equal(this.connection.respond(200, 'you may pass Go'), '200 you may pass Go\r\n');
        })

        it('DSN 200', () => {
            assert.equal(
                this.connection.respond(200, DSN.create(200, 'you may pass Go')),
                '200 2.0.0 you may pass Go\r\n'
            );
        })

        it('DSN 550 create', () => {
            // note, the DSN code overrides the response code
            assert.equal(
                this.connection.respond(450, DSN.create(550, 'This domain is not in use and does not accept mail')),
                '550 5.0.0 This domain is not in use and does not accept mail\r\n'
            );
        })

        it('DSN 550 addr_bad_dest_system', () => {
            assert.equal(
                this.connection.respond(550, DSN.addr_bad_dest_system('This domain is not in use and does not accept mail', 550)),
                '550 5.1.2 This domain is not in use and does not accept mail\r\n'
            );
        })
    })
})
