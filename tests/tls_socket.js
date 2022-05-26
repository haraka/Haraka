const fs     = require('fs')
const path   = require('path')
const os     = require('os')

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

exports.get_loud_certs_dir = {
    setUp: _setup,
    'loads certs from tests/loud/config/tls' (test) {
        test.expect(2);
        this.socket.config = this.socket.config.module_config(path.resolve('tests', 'loud'));
        this.socket.get_certs_dir('tls', (err, certs) => {
            test.ifError(err);
            test.ok(certs);
            test.done();
        })
    }
}

exports.get_certs_dir = {
    setUp: _setup,
    'loads certs from tests/config/tls' (test) {
        test.expect(2);
        this.socket.config = this.socket.config.module_config(path.resolve('tests'));
        this.socket.get_certs_dir('tls', (err, certs) => {
            test.ifError(err);
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
                    mutual_tls: false,
                    no_starttls_ports: [],
                },
                redis: { disable_for_failed_hosts: false },
                no_tls_hosts: {},
                mutual_auth_hosts: {},
                mutual_auth_hosts_exclude: {},
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
                mutual_tls: false,
                no_starttls_ports: [2525],
            },
            redis: { disable_for_failed_hosts: false },
            no_tls_hosts: {},
            mutual_auth_hosts: {},
            mutual_auth_hosts_exclude: {},
            outbound: {
                key: 'outbound_tls_key.pem',
                cert: 'outbound_tls_cert.pem',
                ciphers: 'ECDHE-RSA-AES256-GCM-SHA384',
                minVersion: 'TLSv1',
                dhparam: 'dhparams.pem',
                rejectUnauthorized: false,
                requestCert: false,
                honorCipherOrder: false,
                force_tls_hosts: ['first.example.com', 'second.example.net'],
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
        test.deepEqual(
            res.key.toString(),
            '-BEGIN PRIVATE KEY-\nhello\n--END PRIVATE KEY--'
        );
        test.deepEqual(res.cert, undefined);
        test.done();
    },
    'returns key from BEGIN RSA PRIVATE KEY block' (test) {
        const res = this.socket.parse_x509('-BEGIN RSA PRIVATE KEY-\nhello\n--END RSA PRIVATE KEY--\n-its me-\n');
        test.deepEqual(
            res.key.toString(),
            '-BEGIN RSA PRIVATE KEY-\nhello\n--END RSA PRIVATE KEY--'
        );
        test.deepEqual(res.cert, undefined);
        test.done();
    },
    'returns a key and certificate chain' (test) {
        const str = `-----BEGIN RSA PRIVATE KEY-----
MIIEogIBAAKCAQEAoDGOlvw6lQptaNwqxYsW4aJCPIgvjYw3qA9Y0qykp8I8PapT
ercA8BsInrZg5+3wt2PT1+REprBvv6xfHyQ08o/udsSCBRf4Awadp0fxzUulENNi
3wWuuPy0WgaE4jam7tWItDBeEhXkEfcMTr9XkFxenuTcNw9O1+E8TtNP9KMmJDAe
<snip>
F+T5AoGAMRH1+JrjTpPYcs1hOyHMWnxkHv7fsJMJY/KN2NPoTlI4d4V1W5xyCZ0D
rl7RlVdVTQdZ9VjkWVjJcafNSmNyQEK4IQsaczwOU59IPhC/nUAyRgeoRbKWPQ4r
mj3g7uX9f07j34c01mH1zLgDa24LO9SW7B5ZbYYu4DORk7005B4=
-----END RSA PRIVATE KEY-----
-----BEGIN CERTIFICATE-----
MIIFVzCCBD+gAwIBAgISA/5ofbB6cUAp/PrYaBxTITF2MA0GCSqGSIb3DQEBCwUA
MDIxCzAJBgNVBAYTAlVTMRYwFAYDVQQKEw1MZXQncyBFbmNyeXB0MQswCQYDVQQD
<snip>
kOk4JdlpuBSPwx9wNAEYF15/4LDyev+tyAg7GxCZ9MW53leOxF+j2NQgc4kRIdQc
DYsruShsnwn4HErJKQAfE5Aq77UM32hfKzMb2PH6Ebw0TB2NCLVocOULAGTw4NPO
wBpsGsIFUxeDHZvhKohZyNqLrj7gR+XlKRKM
-----END CERTIFICATE-----

-----BEGIN CERTIFICATE-----
MIIFFjCCAv6gAwIBAgIRAJErCErPDBinU/bWLiWnX1owDQYJKoZIhvcNAQELBQAw
TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh
cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMjAwOTA0MDAwMDAw
<snip>
HlUjr8gRsI3qfJOQFy/9rKIJR0Y/8Omwt/8oTWgy1mdeHmmjk7j1nYsvC9JSQ6Zv
MldlTTKB3zhThV1+XWYp6rjd5JW1zbVWEkLNxE7GJThEUG3szgBVGP7pSWTUTsqX
nLRbwHOoq7hHwg==
-----END CERTIFICATE-----

-----BEGIN CERTIFICATE-----
MIIFYDCCBEigAwIBAgIQQAF3ITfU6UK47naqPGQKtzANBgkqhkiG9w0BAQsFADA/
MSQwIgYDVQQKExtEaWdpdGFsIFNpZ25hdHVyZSBUcnVzdCBDby4xFzAVBgNVBAMT
DkRTVCBSb290IENBIFgzMB4XDTIxMDEyMDE5MTQwM1oXDTI0MDkzMDE4MTQwM1ow
<snip>
WCLKTVXkcGdtwlfFRjlBz4pYg1htmf5X6DYO8A4jqv2Il9DjXA6USbW1FzXSLr9O
he8Y4IWS6wY7bCkjCWDcRQJMEhg76fsO3txE+FiYruq9RUWhiF1myv4Q6W+CyBFC
Dfvp7OOGAN6dEOM4+qR9sdjoSYKEBpsr6GtPAQw4dy753ec5
-----END CERTIFICATE-----`
        const res = this.socket.parse_x509(str);
        test.deepEqual(res.key.length, 446);
        test.deepEqual(res.cert.length, 1195);
        test.done();
    },
    'returns cert and key from EC pem' (test) {
        const fp = fs.readFileSync(path.join('tests','config','tls','ec.pem'))
        const res = this.socket.parse_x509(fp.toString())
        test.deepEqual(
            res.key.toString().split(os.EOL).join('\n'),
            `-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIIDhiI5q6l7txfMJ6kIEYjK12EFcHLvDIkfWIwzdZBsloAoGCCqGSM49
AwEHoUQDQgAEZg2nHEFy9nquFPF3DQyQE28e/ytjXeb4nD/8U+L4KHKFtglaX3R4
uZ+5JcwfcDghpL4Z8h4ouUD/xqe957e2+g==
-----END EC PRIVATE KEY-----`
        );
        test.deepEqual(
            res.cert.toString().split(os.EOL).join('\n'),
            `-----BEGIN CERTIFICATE-----
MIICaTCCAg+gAwIBAgIUEDa9VX16wCdo97WvIk7jyEBz1wQwCgYIKoZIzj0EAwIw
gYkxCzAJBgNVBAYTAlVTMRMwEQYDVQQIDApXYXNoaW5ndG9uMRAwDgYDVQQHDAdT
ZWF0dGxlMRQwEgYDVQQKDAtIYXJha2EgTWFpbDEXMBUGA1UEAwwObWFpbC5oYXJh
a2EuaW8xJDAiBgkqhkiG9w0BCQEWFWhhcmFrYS5tYWlsQGdtYWlsLmNvbTAeFw0y
MTEwMTQwNjQxMTlaFw0yMjEwMTQwNjQxMTlaMIGJMQswCQYDVQQGEwJVUzETMBEG
A1UECAwKV2FzaGluZ3RvbjEQMA4GA1UEBwwHU2VhdHRsZTEUMBIGA1UECgwLSGFy
YWthIE1haWwxFzAVBgNVBAMMDm1haWwuaGFyYWthLmlvMSQwIgYJKoZIhvcNAQkB
FhVoYXJha2EubWFpbEBnbWFpbC5jb20wWTATBgcqhkjOPQIBBggqhkjOPQMBBwNC
AARmDaccQXL2eq4U8XcNDJATbx7/K2Nd5vicP/xT4vgocoW2CVpfdHi5n7klzB9w
OCGkvhnyHii5QP/Gp73nt7b6o1MwUTAdBgNVHQ4EFgQU094ROMLHmLEspT4ZoCfX
Rz0mR/YwHwYDVR0jBBgwFoAU094ROMLHmLEspT4ZoCfXRz0mR/YwDwYDVR0TAQH/
BAUwAwEB/zAKBggqhkjOPQQDAgNIADBFAiEAsmshzvMDjmYDHyGRrKdMmsnnESFd
GMtfRXYIv0AZe7ICIGD2Sta9LL0zZ44ARGXhh+sPjxd78I/+0FdIPsofr2I+
-----END CERTIFICATE-----`);
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
