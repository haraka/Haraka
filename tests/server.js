var path = require('path');

var MessageStream = require('../messagestream');

function _set_up (done) {

    this.server = require('../server');
    this.config = require('../config');

    done();
}

exports.get_listen_addrs = {
    setUp : _set_up,
    'IPv4 fully qualified' : function (test) {
        test.expect(1);
        var listeners = this.server.get_listen_addrs({listen: '127.0.0.1:25'});
        test.deepEqual(['127.0.0.1:25'], listeners);
        test.done();
    },
    'IPv4, default port' : function (test) {
        test.expect(1);
        var listeners = this.server.get_listen_addrs({listen: '127.0.0.1'});
        test.deepEqual(['127.0.0.1:25'], listeners);
        test.done();
    },
    'IPv4, custom port' : function (test) {
        test.expect(1);
        var listeners = this.server.get_listen_addrs({
            listen: '127.0.0.1'
        }, 250);
        test.deepEqual(['127.0.0.1:250'], listeners);
        test.done();
    },
    'IPv6 fully qualified' : function (test) {
        test.expect(1);
        var listeners = this.server.get_listen_addrs({listen: '[::1]:25'});
        test.deepEqual(['[::1]:25'], listeners);
        test.done();
    },
    'IPv6, default port' : function (test) {
        test.expect(1);
        var listeners = this.server.get_listen_addrs({listen: '[::1]'});
        test.deepEqual(['[::1]:25'], listeners);
        test.done();
    },
    'IPv6, custom port' : function (test) {
        test.expect(1);
        var listeners = this.server.get_listen_addrs({listen: '[::1]'}, 250);
        test.deepEqual(['[::1]:250'], listeners);
        test.done();
    },
    'IPv4 & IPv6 fully qualified' : function (test) {
        test.expect(1);
        var listeners = this.server.get_listen_addrs({
            listen: '127.0.0.1:25,[::1]:25'
        });
        test.deepEqual(['127.0.0.1:25','[::1]:25'], listeners);
        test.done();
    },
    'IPv4 & IPv6, default port' : function (test) {
        test.expect(1);
        var listeners = this.server.get_listen_addrs({
            listen: '127.0.0.1:25,[::1]'
        });
        test.deepEqual(['127.0.0.1:25','[::1]:25'], listeners);
        test.done();
    },
    'IPv4 & IPv6, custom port' : function (test) {
        test.expect(1);
        var listeners = this.server.get_listen_addrs({
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
        var c = this.server.cfg.main;
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
        var server;
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
        var docroot = this.server.get_http_docroot();
        test.ok(docroot);
        test.done();
    },
};

exports.createServer = {
    setUp : function (done) {
        process.env.YES_REALLY_DO_DISCARD=1;   // for queue/discard plugin
        process.env.HARAKA_TEST_DIR=path.resolve('tests');

        // this sets the default path for plugin instances to the test dir
        var test_cfg_path=path.resolve('tests');

        this.server = require('../server');
        this.config = require('../config').module_config(test_cfg_path);
        this.server.logger.loglevel = 6;  // INFO

        // set the default path for the plugin loader
        this.server.config = this.config.module_config(test_cfg_path);
        this.server.plugins.config = this.config.module_config(test_cfg_path);
        // this.server.outbound.config = this.config.module_config(test_cfg_path);

        done();
    },
    tearDown: function (done) {
        process.env.YES_REALLY_DO_DISCARD='';
        process.env.HARAKA_TEST_DIR='';
        this.server.gracefulShutdown();
        done();
    },
    'accepts SMTP message from nodemailer': function (test) {

        this.server.load_smtp_ini();

        this.server.createServer({});

        test.expect(1);
        var nodemailer = require('nodemailer');
        var transporter = nodemailer.createTransport({
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
    'accepts SMTP message from smtp_client': function (test) {

        this.server.load_smtp_ini();

        this.server.createServer({});

        test.expect(1);
        var server = { notes: { } };
        var cfg = {
            connect_timeout: 2,
            pool_timeout: 5,
            max_connections: 3,
        };
        var smtp_client = require('../smtp_client');

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
                var message_stream = new MessageStream(
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
