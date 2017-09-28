const path = require('path');

function _set_up (done) {

    this.server = require('../server');
    this.config = require('../config');

    done();
}

exports.get_listen_addrs = {
    setUp : _set_up,
    'IPv4 fully qualified' : function (test) {
        test.expect(1);
        const listeners = this.server.get_listen_addrs({listen: '127.0.0.1:25'});
        test.deepEqual(['127.0.0.1:25'], listeners);
        test.done();
    },
    'IPv4, default port' : function (test) {
        test.expect(1);
        const listeners = this.server.get_listen_addrs({listen: '127.0.0.1'});
        test.deepEqual(['127.0.0.1:25'], listeners);
        test.done();
    },
    'IPv4, custom port' : function (test) {
        test.expect(1);
        const listeners = this.server.get_listen_addrs({
            listen: '127.0.0.1'
        }, 250);
        test.deepEqual(['127.0.0.1:250'], listeners);
        test.done();
    },
    'IPv6 fully qualified' : function (test) {
        test.expect(1);
        const listeners = this.server.get_listen_addrs({listen: '[::1]:25'});
        test.deepEqual(['[::1]:25'], listeners);
        test.done();
    },
    'IPv6, default port' : function (test) {
        test.expect(1);
        const listeners = this.server.get_listen_addrs({listen: '[::1]'});
        test.deepEqual(['[::1]:25'], listeners);
        test.done();
    },
    'IPv6, custom port' : function (test) {
        test.expect(1);
        const listeners = this.server.get_listen_addrs({listen: '[::1]'}, 250);
        test.deepEqual(['[::1]:250'], listeners);
        test.done();
    },
    'IPv4 & IPv6 fully qualified' : function (test) {
        test.expect(1);
        const listeners = this.server.get_listen_addrs({
            listen: '127.0.0.1:25,[::1]:25'
        });
        test.deepEqual(['127.0.0.1:25','[::1]:25'], listeners);
        test.done();
    },
    'IPv4 & IPv6, default port' : function (test) {
        test.expect(1);
        const listeners = this.server.get_listen_addrs({
            listen: '127.0.0.1:25,[::1]'
        });
        test.deepEqual(['127.0.0.1:25','[::1]:25'], listeners);
        test.done();
    },
    'IPv4 & IPv6, custom port' : function (test) {
        test.expect(1);
        const listeners = this.server.get_listen_addrs({
            listen: '127.0.0.1,[::1]'
        }, 250);
        test.deepEqual(['127.0.0.1:250','[::1]:250'], listeners);
        test.done();
    },
};

exports.load_smtp_ini = {
    setUp : _set_up,
    'saves settings to Server.cfg': function (test) {
        test.expect(3);
        this.server.load_smtp_ini();
        // console.log(this.server.cfg);
        const c = this.server.cfg.main;
        test.notEqual(c.daemonize, undefined);
        test.notEqual(c.daemon_log_file, undefined);
        test.notEqual(c.daemon_pid_file, undefined);
        test.done();
    }
};

exports.get_smtp_server = {
    setUp : function (done) {
        this.config = require('../config');
        this.config = this.config.module_config(path.resolve('tests'));

        this.server = require('../server');
        this.server.config = this.config.module_config(path.resolve('tests'));
        this.server.plugins.config = this.config.module_config(path.resolve('tests'));

        done();
    },
    'gets a net server object': function (test) {
        let server;
        try { server = this.server.get_smtp_server('0.0.0.0', 2501, 10); }
        catch (ignore) {
            test.done();
            return;
        }
        if (!server) {   // can't bind to IP/port (fails on Travis)
            console.error('unable to bind to 0.0.0.0:2501')
            // test.expect(0);
            test.done();
            return;
        }
        test.expect(2);
        test.ok(server);
        server.getConnections(function (err, count) {
            test.equal(0, count);
            test.done();
        });
    }
};

exports.get_http_docroot = {
    setUp : _set_up,
    'gets a fs path': function (test) {
        test.expect(1);
        const docroot = this.server.get_http_docroot();
        test.ok(docroot);
        test.done();
    },
};

function _setupServer (done) {
    process.env.YES_REALLY_DO_DISCARD=1;   // for queue/discard plugin
    process.env.HARAKA_TEST_DIR=path.resolve('tests');

    // this sets the default path for plugin instances to the test dir
    const test_cfg_path=path.resolve('tests');

    this.server = require('../server');
    this.config = require('../config').module_config(test_cfg_path);
    this.server.logger.loglevel = 6;  // INFO

    // set the default path for the plugin loader
    this.server.config = this.config.module_config(test_cfg_path);
    this.server.plugins.config = this.config.module_config(test_cfg_path);
    // this.server.outbound.config = this.config.module_config(test_cfg_path);

    this.server.load_smtp_ini();
    this.server.load_default_tls_config(() => {
        this.server.createServer({});
        done();
    })
}

function _tearDownServer (done) {
    delete process.env.YES_REALLY_DO_DISCARD;
    delete process.env.HARAKA_TEST_DIR;
    this.server.stopListeners();
    this.server.plugins.registered_hooks = {};
    setTimeout(() => {
        done();
    }, 200);
}

exports.smtp_client = {
    setUp : _setupServer,
    tearDown: _tearDownServer,
    'accepts SMTP message': function (test) {

        test.expect(1);
        const server = { notes: { } };
        const cfg = {
            connect_timeout: 2,
            pool_timeout: 5,
            max_connections: 3,
        };

        const smtp_client   = require('../smtp_client');
        const MessageStream = require('../messagestream');

        smtp_client.get_client(server, function (err, client) {

            client
                .on('greeting', function (command) {
                    client.send_command('HELO', 'haraka.local');
                })
                .on('helo', function () {
                    client.send_command('MAIL', 'FROM:<test@haraka.local>');
                })
                .on('mail', function () {
                    client.send_command('RCPT', 'TO:<nobody-will-see-this@haraka.local>');
                })
                .on('rcpt', function () {
                    client.send_command('DATA');
                })
                .on('data', function () {
                    const message_stream = new MessageStream(
                        { main : { spool_after : 1024 } }, "theMessageId"
                    );

                    message_stream.on('end', function () {
                        client.socket.write('.\r\n');
                    })
                    message_stream.add_line('Header: test\r\n');
                    message_stream.add_line('\r\n');
                    message_stream.add_line('I am body text\r\n');
                    message_stream.add_line_end();

                    client.start_data(message_stream);
                })
                .on('dot', function () {
                    test.ok(1);
                    client.release();
                    test.done();
                })
                .on('bad_code', function (code, msg) {
                    client.release();
                    test.done();
                });

        }, 2500, 'localhost', cfg);
    },
};

exports.nodemailer = {
    setUp : _setupServer,
    tearDown: _tearDownServer,
    'accepts SMTP message': function (test) {

        test.expect(1);
        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
            host: 'localhost',
            port: 2500,
            tls: {
                // do not fail on invalid certs
                rejectUnauthorized: false
            }
        });
        transporter.sendMail({
            from: '"Testalicious Matt" <harakamail@gmail.com>',
            to:   'nobody-will-see-this@haraka.local',
            envelope: {
                from: 'Haraka Test <test@haraka.local>',
                to:   'Discard Queue <discard@haraka.local>',
            },
            subject: 'Hello ✔',
            text: 'Hello world ?',
            html: '<b>Hello world ?</b>',
        },
        function (error, info){
            if (error){
                console.log(error);
                test.done();
                return;
            }
            test.deepEqual(info.accepted, [ 'discard@haraka.local' ]);
            console.log('Message sent: ' + info.response);
            test.done();
        });
    },
    'accepts authenticated SMTP': function (test) {

        test.expect(1);
        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
            host: 'localhost',
            port: 2500,
            auth: {
                user: 'matt',
                pass: 'goodPass'
            },
            requireTLS: true,
            tls: {
                // do not fail on invalid certs
                rejectUnauthorized: false
            }
        });
        transporter.sendMail({
            from: '"Testalicious Matt" <harakamail@gmail.com>',
            to:   'nobody-will-see-this@haraka.local',
            envelope: {
                from: 'Haraka Test <test@haraka.local>',
                to:   'Discard Queue <discard@haraka.local>',
            },
            subject: 'Hello ✔',
            text: 'Hello world ?',
            html: '<b>Hello world ?</b>',
        },
        function (error, info){
            if (error){
                console.log(error);
                test.done();
                return;
            }
            test.deepEqual(info.accepted, [ 'discard@haraka.local' ]);
            console.log('Message sent: ' + info.response);
            test.done();
        });
    },
    'rejects invalid auth': function (test) {

        test.expect(1);
        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
            host: 'localhost',
            port: 2500,
            auth: {
                user: 'matt',
                pass: 'badPass'
            },
            tls: {
                // do not fail on invalid certs
                rejectUnauthorized: false
            }
        });
        transporter.sendMail({
            from: '"Testalicious Matt" <harakamail@gmail.com>',
            to:   'nobody-will-see-this@haraka.local',
            envelope: {
                from: 'Haraka Test <test@haraka.local>',
                to:   'Discard Queue <discard@haraka.local>',
            },
            subject: 'Hello ✔',
            text: 'Hello world ?',
            html: '<b>Hello world ?</b>',
        },
        function (error, info){
            if (error){
                test.equals(error.code, 'EAUTH');
                // console.log(error);
                test.done();
                return;
            }
            console.log(info.response);
            test.done();
        });
    },
    'DKIM validates signed message': function (test) {

        test.expect(1);
        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
            host: 'localhost',
            port: 2500,
            tls: {
                // do not fail on invalid certs
                rejectUnauthorized: false
            }
        });
        transporter.sendMail({
            from: '"Testalicious Matt" <harakamail@gmail.com>',
            to:   'nobody-will-see-this@haraka.local',
            envelope: {
                from: 'Haraka Test <test@haraka.local>',
                to:   'Discard Queue <discard@haraka.local>',
            },
            subject: 'Hello ✔',
            text: 'Hello world ?',
            html: '<b>Hello world ?</b>',
            dkim: {
                domainName: "test.simerson.com",
                keySelector: "harakatest2017",
                privateKey: '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEAxqoUAnQ9GB3iNnkS7coj0Iggd0nyryW062tpK95NC5UXmmAwIpUMfkYdiHY2o2duWYGF0Bp237M/QXKhJYTXfsgkwP/bq9OGWtRZxHPHhbhdjbiI\nqObi6zvYcxrI77gpWDDvruhMeS9Hwa1R99pLUWd4PsuYTzbV/jwu2pz+XZXXXNEU\nVxzDAAj0yF7mwxHMLzQfR+hdhWcrgN0stUP0o7hm7hoOP8IWgcSW3JiQYavIKoI4\nm4+I9I1LzDJN2rHVnQvmjUrqqpG7X6SyFVFtuTWGaMqf1Cj/t8eSvU9VdgLFllS8\ntThqUZHq5S5hm8M8VzLuQLG9U0dtFolcFmJkbQIDAQABAoIBAB4fUbNhjpXmihM6\nXm1htfZ7fXi45Kw76me7vJGjPklgTNjidsn3kZJf7UBwtC4ok6nMos6ABMA8fH3e\n9KIst0QI8tG0ucke5INHKWlJKNqUrtK7RTVe9M84HsStLgRzBwnRObZqkJXbXmT2\nc7RCDCOGrcvPsQNpzB6lX3FUVpk3x24RXpQV1qSgH8yuHSPc1C6rssXwPAgnESfS\nK3MHRx2CLZvTTkq/YCsT+wS/O9RWPCVOYuWaa5DDDAIp3Yw1wYq9Upoh0BdIFC3U\nWm+5Cr3o9wxcvS6+W2RA6I51eymzvCU5ZakWt/bnUDb6/ByxsWOn5rL4WfPpCwE4\nnuC72v0CgYEA9imEq6a0GoaEsMoR7cxT7uXKimQH+Jaq3CGkuh0iN32F4FXhuUKz\nLYKSLCZzpb1MiDJv6BBchV6uSQ6ATo1cZ8WzYQISikk175bf0SPom591OZElvKA2\nSOrTrXtbl33YbWZEgyEcpTgelVi5ys9rj4eKkMvM0lwRmW6gctEFXRcCgYEAzpqc\nR/wqPjgPhpF1CZtdEwOZg4kkOig8CBcuQ7o/hDG7N69A9ZbeJO8eD+gKDrHRfkYr\nTH/UdkZGjilBk/lxnpIZpyBLxQ6UdhNPuwtxXKAvuSN+aQ0pdJn8tg03OSj2OzTK\nJ4hMsO/wt1xM8EDRobLZEosMadaYZUHzx8VU5RsCgYEAvFZbuXEcT0cocpLIUOaK\nOTf7VRLfvmSYaUAcZoEv0sDpExDiWPodWO6To8/vn5lL2tCsKiOKhkhAlIjRxkgF\nsSfj7I7HXKJS7/LBX6RXrem8qMTS2JTDs9pnBk5hb3DLjDg4pxNIdWiQjbeKvw8f\nvnr3m30yQqhKlte7Tt15exUCgYBzq7RbyR6Nfy2SFdYE7usJPjawohOaS/RwQyov\n2RK+nGlJH+GqnjD5VLbsCOm4mG3F2NtdFSSKo4XVCdwhUMMAGKQsIbTKOwN7qAw3\nmIx7Y2PUr76SakAPfDc0ZenJItnZBBE6WOE3Ht8Siaa5zFCRy2QlMZxdlTv1VRt7\neUuyiQKBgQDdXJO5+3h1HPxbYZcmNm/2CJUNw2ehU8vCiBXCcWPn7JukayHx+TXy\nyj0j/b1SvmKgjB+4JWluiqIU+QBjRjvb397QY1YoCEaGZd0zdFjTZwQksQ5AFst9\nCiD9OFXe/kkmIUQQra6aw1CoppyAfvAblp8uevLWb57xU3VUB3xeGg==\n-----END RSA PRIVATE KEY-----\n',
            }
        },
        function (error, info){
            // console.log(info);
            if (error){
                console.log(error);
                test.done();
                return;
            }
            test.deepEqual(info.accepted, [ 'discard@haraka.local' ]);
            console.log('Message sent: ' + info.response);
            test.done();
        });
    },
}
