
const path        = require('path');
const vm_harness  = require('./fixtures/vm_harness');

vm_harness.add_tests(
    path.join(__dirname, '..', 'smtp_client.js'),
    path.join(__dirname, 'smtp_client') + path.sep,
    exports
);

const smtp_client = require('../smtp_client');
const fixtures    = require('haraka-test-fixtures');

function getClientOpts (socket) {
    return { port: 25, host: 'localhost', connect_timeout: 30, idle_timeout: 30, socket }
}

exports.testUpgradeIsCalledOnSTARTTLS = test => {
    test.expect(1);

    const plugin = new fixtures.plugin('queue/smtp_forward');

    // switch config directory to 'tests/config'
    plugin.config = plugin.config.module_config(path.resolve('tests'));

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
    };

    const client = new smtp_client.smtp_client(getClientOpts(socket));
    client.load_tls_config({ key: Buffer.from('OutboundTlsKeyLoaded')});

    client.command = 'starttls';
    cmds.line('250 Hello client.example.com\r\n');

    const StringDecoder = require('string_decoder').StringDecoder;
    const decoder = new StringDecoder('utf8');

    const cent = Buffer.from(upgradeArgs.key);
    test.equal(decoder.write(cent), 'OutboundTlsKeyLoaded');

    test.done();
}

exports.startTLS = test => {
    test.expect(1);

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

    test.equal(cmd, 'STARTTLS\r\n');
    test.done();
}
