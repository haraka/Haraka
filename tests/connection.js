
const constants    = require('haraka-constants');

const connection   = require('../connection');
const Server       = require('../server');

// huge hack here, but plugin tests need constants
constants.import(global);

function _set_up (done) {
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
    done();
}

function _tear_down (done) {
    done();
}

exports.connectionRaw = {
    setUp : _set_up,
    tearDown : _tear_down,
    'has remote object' (test) {
        test.expect(5);
        test.deepEqual(this.connection.remote, {
            ip: null,
            port: null,
            host: null,
            info: null,
            closed: false,
            is_private: false,
            is_local: false
        });
        // backwards compat, sunset v3.0.0
        test.equal(this.connection.remote_ip, null);
        test.equal(this.connection.remote_port, null);
        test.equal(this.connection.remote_host, null);
        test.equal(this.connection.remote_info, null);
        test.done();
    },
    'has local object' (test) {
        test.expect(5);
        test.equal(this.connection.local.ip, null);
        test.equal(this.connection.local.port, null);
        test.ok(this.connection.local.host, this.connection.local.host);
        // backwards compat, sunset v3.0.0
        test.equal(this.connection.local_ip, null);
        test.equal(this.connection.local_port, null);
        test.done();
    },
    'has tls object' (test) {
        test.expect(2);
        test.deepEqual(this.connection.tls, {
            enabled: false,
            advertised: false,
            verified: false,
            cipher: {},
        });
        // backwards compat, sunset v3.0.0
        test.equal(this.connection.using_tls, false);
        test.done();
    },
    'get_capabilities' (test) {
        test.expect(1);
        test.deepEqual([], this.connection.get_capabilities());
        test.done();
    },
    'queue_msg, defined' (test) {
        test.expect(1);
        test.equal(
            'test message',
            this.connection.queue_msg(1, 'test message')
        );
        test.done();
    },
    'queue_msg, default deny' (test) {
        test.expect(2);
        test.equal(
            'Message denied',
            this.connection.queue_msg(DENY)
        );
        test.equal(
            'Message denied',
            this.connection.queue_msg(DENYDISCONNECT)
        );
        test.done();
    },
    'queue_msg, default denysoft' (test) {
        test.expect(2);
        test.equal(
            'Message denied temporarily',
            this.connection.queue_msg(DENYSOFT)
        );
        test.equal(
            'Message denied temporarily',
            this.connection.queue_msg(DENYSOFTDISCONNECT)
        );
        test.done();
    },
    'queue_msg, default else' (test) {
        test.expect(1);
        test.equal('', this.connection.queue_msg('hello'));
        test.done();
    },
    'has legacy connection properties' (test) {
        test.expect(4);
        this.connection.set('remote', 'ip', '172.16.15.1');
        this.connection.set('hello', 'verb', 'EHLO');
        this.connection.set('tls', 'enabled', true);

        test.equal('172.16.15.1', this.connection.remote_ip);
        test.equal(null, this.connection.remote_port);
        test.equal('EHLO', this.connection.greeting);
        test.equal(true, this.connection.using_tls);
        test.done();
    },
    'has normalized connection properties' (test) {
        test.expect(5);
        this.connection.set('remote', 'ip', '172.16.15.1');
        this.connection.set('hello', 'verb', 'EHLO');
        this.connection.set('tls', 'enabled', true);

        test.equal('172.16.15.1', this.connection.remote.ip);
        test.equal(null, this.connection.remote.port);
        test.equal('EHLO', this.connection.hello.verb);
        test.equal(null, this.connection.hello.host);
        test.equal(true, this.connection.tls.enabled);
        test.done();
    },
    'sets remote.is_private and remote.is_local' (test) {
        test.expect(2);
        test.equal(false, this.connection.remote.is_private);
        test.equal(false, this.connection.remote.is_local);
        test.done();
    },
    'has legacy proxy property set' (test) {
        test.expect(1);
        this.connection.set('proxy', 'ip', '172.16.15.1');
        test.equal('172.16.15.1', this.connection.haproxy_ip);
        test.done();
    },
    'has normalized proxy properties, default' (test) {
        test.expect(4);
        test.equal(false, this.connection.proxy.allowed);
        test.equal(null, this.connection.proxy.ip);
        test.equal(null, this.connection.proxy.type);
        test.equal(null, this.connection.proxy.timer);
        test.done();
    },
    'has normalized proxy properties, set' (test) {
        test.expect(4);
        this.connection.set('proxy', 'ip', '172.16.15.1');
        this.connection.set('proxy', 'type', 'haproxy');
        this.connection.set('proxy', 'timer', setTimeout(() => {}, 1000));
        this.connection.set('proxy', 'allowed', true);

        test.equal(true, this.connection.proxy.allowed);
        test.equal('172.16.15.1', this.connection.proxy.ip);
        test.ok(this.connection.proxy.timer);
        test.equal(this.connection.proxy.type, 'haproxy');
        test.done();
    },
    /*
    'max_data_exceeded_respond' : function (test) {
        test.expect(1);
        test.ok(this.connection.max_data_exceeded_respond(DENYSOFT, 'test' ));
        test.done();
    }
    */
}

exports.connectionPrivate = {
    setUp (done) {
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
        done();
    },
    tearDown : _tear_down,
    'sets remote.is_private and remote.is_local' (test) {
        test.expect(3);
        test.equal(true, this.connection.remote.is_private);
        test.equal(false, this.connection.remote.is_local);
        test.equal(2525, this.connection.remote.port);
        test.done();
    },
}

exports.connectionLocal = {
    setUp (done) {
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
    },
    tearDown : _tear_down,
    'sets remote.is_private and remote.is_local' (test) {
        test.expect(3);
        test.equal(true, this.connection.remote.is_private);
        test.equal(true, this.connection.remote.is_local);
        test.equal(2525, this.connection.remote.port);
        test.done();
    },
}

exports.get_remote = {
    setUp : _set_up,
    tearDown : _tear_down,
    'valid hostname' (test) {
        test.expect(1);
        this.connection.remote.host='a.host.tld'
        this.connection.remote.ip='172.16.199.198'
        test.equal(this.connection.get_remote('host'), 'a.host.tld [172.16.199.198]');
        test.done();
    },
    'no hostname' (test) {
        test.expect(1);
        this.connection.remote.ip='172.16.199.198'
        test.equal(this.connection.get_remote('host'), '[172.16.199.198]');
        test.done();
    },
    'DNSERROR' (test) {
        test.expect(1);
        this.connection.remote.host='DNSERROR'
        this.connection.remote.ip='172.16.199.198'
        test.equal(this.connection.get_remote('host'), '[172.16.199.198]');
        test.done();
    },
    'NXDOMAIN' (test) {
        test.expect(1);
        this.connection.remote.host='NXDOMAIN'
        this.connection.remote.ip='172.16.199.198'
        test.equal(this.connection.get_remote('host'), '[172.16.199.198]');
        test.done();
    },
}

exports.local_info = {
    setUp : _set_up,
    tearDown : _tear_down,
    'is Haraka/version' (test) {
        test.expect(1);
        test.ok(/Haraka\/\d.\d/.test(this.connection.local.info), this.connection.local.info);
        test.done();
    }
}

exports.relaying = {
    setUp : _set_up,
    tearDown : _tear_down,
    'sets and gets' (test) {
        test.expect(3);
        test.equal(this.connection.relaying, false);
        test.ok(this.connection.relaying = 'alligators');
        test.equal(this.connection.relaying, 'alligators');
        test.done();
    },
    'sets and gets in a transaction' (test) {
        test.expect(4);
        test.equal(this.connection.relaying, false);
        this.connection.transaction = {};
        test.ok(this.connection.relaying = 'crocodiles');
        test.equal(this.connection.transaction._relaying, 'crocodiles');
        test.equal(this.connection.relaying, 'crocodiles');
        test.done();
    }
}

exports.get_set = {
    setUp : _set_up,
    tearDown : _tear_down,
    'sets single level properties' (test) {
        test.expect(2);
        this.connection.set('encoding', true);
        test.ok(this.connection.encoding);
        test.ok(this.connection.get('encoding'));
        test.done();
    },
    'sets two level deep properties' (test) {
        test.expect(2);
        this.connection.set('local.host', 'test');
        test.equal(this.connection.local.host, 'test');
        test.equal(this.connection.get('local.host'), 'test');
        test.done();
    },
    'sets three level deep properties' (test) {
        test.expect(2);
        this.connection.set('some.fine.example', true);
        test.ok(this.connection.some.fine.example);
        test.ok(this.connection.get('some.fine.example'));
        test.done();
    },
}
