require('../configfile').watch_files = false;
var tls_socket = require('../tls_socket');

function _check(test, cfg, ip, res) {
    test.expect(1);
    test.equals(tls_socket.is_no_tls_host(cfg, ip), res);
    test.done();
}

exports.is_no_tls_host = {
    'domain.com': function (test) {
        _check(test, { no_tls_hosts: { 'domain.com': undefined } }, 'domain.com', true);
    },
    'foo.com': function (test) {
        _check(test, { no_tls_hosts: { } }, 'foo.com', false);
    },
    '1.2.3.4': function (test) {
        _check(test, { no_tls_hosts: { '1.2.3.4': undefined } }, '1.2.3.4', true);
    },
    '1.2.3.4/32': function (test) {
        _check(test, { no_tls_hosts: { '1.2.3.4/32': undefined } }, '1.2.3.4', true);
    },
    '1.2.0.0/16 <-> 1.2.3.4': function (test) {
        _check(test, { no_tls_hosts: { '1.2.0.0/16': undefined } }, '1.2.3.4', true);
    },
    '1.2.0.0/16 <-> 5.6.7.8': function (test) {
        _check(test, { no_tls_hosts: { '1.2.0.0/16': undefined } }, '5.6.7.8', false);
    },
    '0000:0000:0000:0000:0000:0000:0000:0001': function (test) {
        _check(test, { no_tls_hosts: { '0000:0000:0000:0000:0000:0000:0000:0001': undefined } }, '0000:0000:0000:0000:0000:0000:0000:0001', true);
    },
    '0:0:0:0:0:0:0:1': function (test) {
        _check(test, { no_tls_hosts: { '0:0:0:0:0:0:0:1': undefined } }, '0000:0000:0000:0000:0000:0000:0000:0001', true);
    },
    '1.2 (bad config)': function (test) {
        _check(test, { no_tls_hosts: { '1.2': undefined } }, '1.2.3.4', false);
    },
    '1.2.3.4/ (mask ignored)': function (test) {
        _check(test, { no_tls_hosts: { '1.2.3.4/': undefined } }, '1.2.3.4', true);
    },
    '1.2.3.4/gr (mask ignored)': function (test) {
        _check(test, { no_tls_hosts: { '1.2.3.4/gr': undefined } }, '1.2.3.4', true);
    },
    '1.2.3.4/400 (mask read as 400 bits)': function (test) {
        _check(test, { no_tls_hosts: { '1.2.3.4/400': undefined } }, '1.2.3.4', true);
    }
};

