
const path   = require('path');

function _setup (done) {

    this.socket = require('../tls_socket');

    // use tests/config instead of ./config
    this.socket.config = this.socket.config.module_config(path.resolve('tests'));

    done();
}

exports.tls_socket = {
    setUp: _setup,
    'loads' (test) {
        test.expect(1);
        test.ok(this.socket);
        test.done();
    },
    'exports createConnection' (test) {
        test.expect(1);
        test.equal(typeof this.socket.createConnection, 'function');
        test.done();
    },
    'exports createServer' (test) {
        test.expect(1);
        // console.log(this.socket);
        test.equal(typeof this.socket.createServer, 'function');
        test.done();
    },
    'exports shutdown' (test) {
        test.expect(1);
        // console.log(this.socket);
        test.equal(typeof this.socket.shutdown, 'function');
        test.done();
    },
}

exports.createServer = {
    setUp: _setup,
    'returns a net.Server' (test) {
        test.expect(1);
        const server = this.socket.createServer(sock => {
            console.log(sock);
        });
        test.ok(server);
        test.done();
    }
}

exports.saveOpt = {
    setUp: _setup,
    'saveOpt' (test) {
        test.expect(1);
        this.socket.saveOpt('*', 'dhparam', 'a file name');
        test.ok(this.socket.certsByHost['*'].dhparam);
        // console.log(this.socket.certsByHost['*']);
        test.done();
    }
}

exports.load_tls_ini = {
    setUp: _setup,
    'tls.ini loads' (test) {
        test.expect(2);
        test.ok(this.socket.load_tls_ini().main !== undefined);
        test.ok(this.socket.certsByHost['*'].key);
        // console.log(this.socket.cfg);
        // console.log(this.socket.certsByHost);
        test.done();
    },
}

exports.get_certs_dir = {
    setUp: _setup,
    'loads certs from config/tls' (test) {
        test.expect(2);
        this.socket.get_certs_dir('tls', (err, certs) => {
            test.ifError(err);
            // console.error(certs);
            test.ok(certs);
            test.done();
        })
    }
}

exports.getSocketOpts = {
    setUp: _setup,
    'gets socket opts for *' (test) {
        test.expect(2);
        this.socket.get_certs_dir('tls', () => {
            this.socket.getSocketOpts('*', (opts) => {
                // console.log(opts);
                test.ok(opts.key);
                test.ok(opts.cert);
                test.done();
            })
        })
    },
}

exports.ensureDhparams = {
    setUp : _setup,
    'generates a missing dhparams file' (test) {
        test.expect(2);
        this.socket.load_tls_ini();
        this.socket.ensureDhparams((err, dhparams) => {
            // console.log(dhparams);
            test.ifError(err);
            test.ok(dhparams);
            test.done();
        })
    },
}

exports.load_tls_ini2 = {
    setUp (done) {
        this.socket = require('../tls_socket');
        delete process.env.HARAKA_TEST_DIR;
        done();
    },
    'loads missing tls.ini default config' (test) {
        test.expect(1);
        this.socket.config = this.socket.config.module_config(path.resolve('non-exist'));
        test.deepEqual(this.socket.load_tls_ini(),
            {
                main: {
                    requestCert: true,
                    rejectUnauthorized: false,
                    honorCipherOrder: true,
                    requestOCSP: false,
                    // enableOCSPStapling: false,
                    requireAuthorized: [],
                },
                redis: { disable_for_failed_hosts: false },
                no_tls_hosts: {}
            });
        test.done();
    },
    'loads tls.ini from test dir' (test) {
        test.expect(1);
        this.socket.config = this.socket.config.module_config(path.resolve('tests'));
        test.deepEqual(this.socket.load_tls_ini(), {
            main: {
                requestCert: true,
                rejectUnauthorized: false,
                honorCipherOrder: true,
                requestOCSP: false,
                key: 'tls_key.pem',
                cert: 'tls_cert.pem',
                dhparam: 'dhparams.pem',
                ciphers: 'ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-SHA384',
                minVersion: 'TLSv1',
                requireAuthorized: [2465, 2587],
            },
            redis: { disable_for_failed_hosts: false },
            no_tls_hosts: {},
            outbound: {
                key: 'outbound_tls_key.pem',
                cert: 'outbound_tls_cert.pem',
                ciphers: 'ECDHE-RSA-AES256-GCM-SHA384',
                minVersion: 'TLSv1',
                dhparam: 'dhparams.pem',
                rejectUnauthorized: false,
                requestCert: false,
                honorCipherOrder: false,
            }
        });
        test.done();
    },
}

exports.parse_x509 = {
    setUp: _setup,
    'returns empty object on empty input' (test) {
        const res = this.socket.parse_x509();
        test.deepEqual(res, {});
        test.done();
    },
    'returns key from BEGIN PRIVATE KEY block' (test) {
        const res = this.socket.parse_x509('-BEGIN PRIVATE KEY-\nhello\n--END PRIVATE KEY--\n-its me-\n');
        res.key.toString();
        test.deepEqual(
            res.key.toString(),
            '-BEGIN PRIVATE KEY-\nhello\n--END PRIVATE KEY--\n'
        );
        // everything after the private key is cert(s)
        test.deepEqual(res.cert.toString(), '-its me-\n');
        test.done();
    },
    'returns key from BEGIN RSA PRIVATE KEY block' (test) {
        const res = this.socket.parse_x509('-BEGIN RSA PRIVATE KEY-\nhello\n--END RSA PRIVATE KEY--\n-its me-\n');
        res.key.toString();
        test.deepEqual(
            res.key.toString(),
            '-BEGIN RSA PRIVATE KEY-\nhello\n--END RSA PRIVATE KEY--\n'
        );
        // everything after the private key is cert(s)
        test.deepEqual(res.cert.toString(), '-its me-\n');
        test.done();
    },
}

exports.parse_x509_names = {
    setUp: _setup,
    'extracts nictool.com from x509 Subject CN' (test) {
        test.expect(1);
        const r = this.socket.parse_x509_names('        Validity\n            Not Before: Jan 15 22:47:00 2017 GMT\n            Not After : Apr 15 22:47:00 2017 GMT\n        Subject: CN=nictool.com\n        Subject Public Key Info:\n');
        test.deepEqual(r, ['nictool.com']);
        test.done();
    },
    'extracts haraka.local from x509 Subject CN' (test) {
        test.expect(1);
        const r = this.socket.parse_x509_names('        Validity\n            Not Before: Mar  4 23:28:49 2017 GMT\n            Not After : Mar  3 23:28:49 2023 GMT\n        Subject: C=US, ST=Washington, L=Seattle, O=Haraka, CN=haraka.local/emailAddress=matt@haraka.local\n        Subject Public Key Info:\n            Public Key Algorithm: rsaEncryption\n');
        test.deepEqual(r, ['haraka.local']);
        test.done();
    },
    'extracts host names from X509v3 Subject Alternative Name' (test) {
        test.expect(1);
        const r = this.socket.parse_x509_names('                CA Issuers - URI:http://cert.int-x3.letsencrypt.org/\n\n            X509v3 Subject Alternative Name: \n                DNS:nictool.com, DNS:nictool.org, DNS:www.nictool.com, DNS:www.nictool.org\n            X509v3 Certificate Policies: \n                Policy: 2.23.140.1.2.1\n');
        test.deepEqual(r, ['nictool.com', 'nictool.org', 'www.nictool.com', 'www.nictool.org']);
        test.done();
    },
    'extracts host names from both' (test) {
        test.expect(2);

        let r = this.socket.parse_x509_names('        Validity\n            Not Before: Jan 15 22:47:00 2017 GMT\n            Not After : Apr 15 22:47:00 2017 GMT\n        Subject: CN=nictool.com\n        Subject Public Key Info:\n                CA Issuers - URI:http://cert.int-x3.letsencrypt.org/\n\n            X509v3 Subject Alternative Name: \n                DNS:nictool.com, DNS:nictool.org, DNS:www.nictool.com, DNS:www.nictool.org\n            X509v3 Certificate Policies: \n                Policy: 2.23.140.1.2.1\n');
        test.deepEqual(r, ['nictool.com', 'nictool.org', 'www.nictool.com', 'www.nictool.org']);

        r = this.socket.parse_x509_names('        Validity\n            Not Before: Jan 15 22:47:00 2017 GMT\n            Not After : Apr 15 22:47:00 2017 GMT\n        Subject: CN=foo.nictool.com\n        Subject Public Key Info:\n                CA Issuers - URI:http://cert.int-x3.letsencrypt.org/\n\n            X509v3 Subject Alternative Name: \n                DNS:nictool.com, DNS:nictool.org, DNS:www.nictool.com, DNS:www.nictool.org\n            X509v3 Certificate Policies: \n                Policy: 2.23.140.1.2.1\n');
        test.deepEqual(r, ['foo.nictool.com', 'nictool.com', 'nictool.org', 'www.nictool.com', 'www.nictool.org']);

        test.done();
    },
    'extracts expiration date' (test) {
        test.expect(1);
        const r = this.socket.parse_x509_expire('foo', 'Validity\n            Not Before: Mar  4 23:28:49 2017 GMT\n            Not After : Mar  3 23:28:49 2023 GMT\n        Subject');
        test.deepEqual(r, new Date('2023-03-03T23:28:49.000Z'));
        test.done();
    },
}
