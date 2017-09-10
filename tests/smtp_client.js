
require('../configfile').watch_files = false;
const path        = require('path');
const vm_harness  = require('./fixtures/vm_harness');

vm_harness.add_tests(
    path.join(__dirname, '..', 'smtp_client.js'),
    path.join(__dirname, 'smtp_client') + path.sep,
    exports
);

const smtp_client = require('../smtp_client');
const fixtures    = require('haraka-test-fixtures');

exports.testUpgradeIsCalledOnSTARTTLS = function (test) {
    test.expect(1);

    const plugin = new fixtures.plugin('queue/smtp_forward');

    // switch config directory to 'tests/config'
    plugin.config = plugin.config.module_config(path.resolve('tests'));

    plugin.register();

    const cmds = {};
    let upgradeArgs = {};

    const socket = {
        setTimeout: function (arg) {  },
        setKeepAlive: function (arg) {  },
        on: function (eventName, callback) {
            cmds[eventName] = callback;
        },
        upgrade: function (arg) {
            upgradeArgs = arg;
        }
    };

    const client = new smtp_client.smtp_client(25, 'localhost', 30, 30, socket);
    client.load_tls_config({ key: Buffer.from('OutboundTlsKeyLoaded')});

    client.command = 'starttls';
    cmds.line('250 Hello client.example.com\r\n');

    const StringDecoder = require('string_decoder').StringDecoder;
    const decoder = new StringDecoder('utf8');

    const cent = Buffer.from(upgradeArgs.key);
    test.equal(decoder.write(cent), 'OutboundTlsKeyLoaded');

    test.done();
}

exports.startTLS = function (test) {
    test.expect(1);

    let cmd = '';

    const socket = {
        setTimeout: function (arg) {  },
        setKeepAlive: function (arg) {  },
        on: function (eventName, callback) {  },
        upgrade: function (arg) {  },
        write: function (arg) { cmd = arg; }
    };

    const client = new smtp_client.smtp_client(25, 'localhost', 30, 30, socket);
    client.tls_options = {};

    client.secured = false;
    client.response = [ 'STARTTLS' ]

    smtp_client.onCapabilitiesOutbound(client, false, undefined, { 'enable_tls': true });

    test.equal(cmd, 'STARTTLS\r\n');
    test.done();
}