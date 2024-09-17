const assert = require('node:assert')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')

const _setup = (done) => {
    this.socket = require('../tls_socket');

    // use test/config instead of ./config
    this.socket.config = this.socket.config.module_config(path.resolve('test'));
    done();
}

describe('tls_socket', () => {
    beforeEach(_setup)

    it('loads', () => {
        assert.ok(this.socket);
    })
    it('exports createConnection', () => {
        assert.equal(typeof this.socket.createConnection, 'function');
    })
    it('exports createServer', () => {
        // console.log(this.socket);
        assert.equal(typeof this.socket.createServer, 'function');
    })
    it('exports shutdown', () => {
        // console.log(this.socket);
        assert.equal(typeof this.socket.shutdown, 'function');
    })

    describe('createServer', () => {
        beforeEach(_setup)

        it('returns a net.Server', () => {
            const server = this.socket.createServer(sock => {
                // TODO: socket test?
            })
            assert.ok(server)
        })
    })

    describe('load_tls_ini', () => {
        beforeEach(_setup)

        it('tls.ini loads', () => {
            assert.ok(this.socket.load_tls_ini().main !== undefined);
            assert.ok(this.socket.certsByHost['*'].key);
            // console.log(this.socket.cfg);
            // console.log(this.socket.certsByHost);
        })
    })

    describe('get_loud_certs_dir', () => {
        beforeEach(_setup)

        it('loads certs from test/loud/config/tls', async () => {
            this.socket.config = this.socket.config.module_config(path.resolve('test', 'loud'));
            this.socket.load_tls_ini()
            const certs = await this.socket.get_certs_dir('tls')
            assert.ok(certs);
        })
    })

    describe('get_certs_dir', () => {
        beforeEach(_setup)

        it('loads certs from test/config/tls', async () => {
            this.socket.config = this.socket.config.module_config(path.resolve('test'));
            this.socket.load_tls_ini()
            try {
                const certs = await this.socket.get_certs_dir('tls')
                assert.ok(certs['*'])
                assert.ok(certs['mail.haraka.io'])
                assert.ok(certs['haraka.local'])
                assert.ok(certs['*.example.com'])
            }
            catch (err) {
                assert.ifError(err);
            }
        })
    })

    describe('getSocketOpts', () => {
        beforeEach(_setup)

        it('gets socket opts for *', async () => {
            const certs = await this.socket.get_certs_dir('tls')
            this.socket.getSocketOpts('*').then(opts => {
                // console.log(opts);
                assert.ok(opts.key);
                assert.ok(opts.cert);
            })
        })
    })

    describe('ensureDhparams', () => {
        beforeEach(_setup)
        it('generates a missing dhparams file', () => {
            this.socket.load_tls_ini();
            this.socket.ensureDhparams((err, dhparams) => {
                // console.log(dhparams);
                assert.ifError(err);
                assert.ok(dhparams);
            })
        })
    })

    describe('load_tls_ini2', () => {
        beforeEach((done) => {
            this.socket = require('../tls_socket');
            delete process.env.HARAKA_TEST_DIR;
            done();
        })

        it('loads missing tls.ini default config', () => {
            this.socket.config = this.socket.config.module_config(path.resolve('non-exist'));
            assert.deepEqual(this.socket.load_tls_ini(),
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
        })

        it('loads tls.ini from test dir', () => {
            this.socket.config = this.socket.config.module_config(path.resolve('test'));
            assert.deepEqual(this.socket.load_tls_ini(), {
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
                no_tls_hosts: {
                    '192.168.1.1': undefined,
                    '172.16.0.0/16': undefined,
                },
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
                    no_tls_hosts: ['127.0.0.2', '192.168.31.1/24'],
                }
            })
        })
    })

    describe('parse_x509', () => {
        beforeEach(_setup)

        it('returns empty object on empty input', async () => {
            const res = await this.socket.parse_x509()
            assert.deepEqual(res, {});
        })

        it('returns key from BEGIN PRIVATE KEY block', async () => {
            const res = await this.socket.parse_x509('-BEGIN PRIVATE KEY-\nhello\n--END PRIVATE KEY--\n-its me-\n');
            assert.deepEqual(
                res.keys[0].toString(),
                '-BEGIN PRIVATE KEY-\nhello\n--END PRIVATE KEY--',
            );
            assert.deepEqual(res.cert, undefined);
        })

        it('returns key from BEGIN RSA PRIVATE KEY block', async () => {
            const res = await this.socket.parse_x509('-BEGIN RSA PRIVATE KEY-\nhello\n--END RSA PRIVATE KEY--\n-its me-\n');
            assert.deepEqual(
                res.keys[0].toString(),
                '-BEGIN RSA PRIVATE KEY-\nhello\n--END RSA PRIVATE KEY--',
            );
            assert.deepEqual(res.cert, undefined);
        })

        it.skip('returns a key and certificate chain', async () => {
            // doesn't work, b/c parse now parses and needs non-snipped
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
            const res = await this.socket.parse_x509(str);
            assert.deepEqual(res.key.length, 446);
            assert.deepEqual(res.cert.length, 1195);
        })

        it('returns cert and key from EC pem', async () => {
            const fp = await fs.readFile(path.join('test','config','tls','ec.pem'))
            const res = await this.socket.parse_x509(fp.toString())
            assert.deepEqual(
                res.keys[0].toString().split(os.EOL).join('\n'),
                `-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIIDhiI5q6l7txfMJ6kIEYjK12EFcHLvDIkfWIwzdZBsloAoGCCqGSM49
AwEHoUQDQgAEZg2nHEFy9nquFPF3DQyQE28e/ytjXeb4nD/8U+L4KHKFtglaX3R4
uZ+5JcwfcDghpL4Z8h4ouUD/xqe957e2+g==
-----END EC PRIVATE KEY-----`
            );
            assert.deepEqual(
                res.chain[0].toString().split(os.EOL).join('\n'),
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
        })
    })
})
