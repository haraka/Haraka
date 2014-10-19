// Forward to an SMTP server
// Opens the connection to the ongoing SMTP server at queue time
// and passes back any errors seen on the ongoing server to the
// originating server.

var smtp_client_mod = require('./smtp_client');

exports.hook_queue = function (next, connection) {
    var plugin = this;
    var config;
    if(connection.notes.auth_proxy) {
	config = { main: connection.notes.auth_proxy };
        connection.loginfo(this, "Reusing data from auth_proxy.");
    } else {
	config = this.config.get('smtp_forward.ini');
    }


    connection.loginfo(this, "forwarding to " + config.main.host + ":" + config.main.port);
    smtp_client_mod.get_client_plugin(this, connection, config, function (err, smtp_client) {
        smtp_client.next = next;


	if(config.main.user) {
            connection.loginfo(plugin, "Configuring loging in for SMTP server " + config.main.host + ":" + config.main.port);
            smtp_client.on('greeting', function() {

                var base64 = function (str) {
                    var buffer = new Buffer(str, "UTF-8");
                    return buffer.toString("base64");
                }


                if(config.main.login == 'PLAIN') {
                    connection.loginfo(plugin, "Logging in with AUTH PLAIN " + config.main.user);
                    smtp_client.send_command('AUTH','PLAIN ' + base64("\0" + config.main.user + "\0" + config.main.passwd));
                } else if(config.login == 'LOGIN') {
                    smtp_client.send_command('AUTH','LOGIN');
                    smtp_client.on('auth', function() {
                        connection.loginfo(plugin, "Logging in with AUTH LOGIN " + config.main.user);
                    });
                    smtp_client.on('auth_username', function() {
                        smtp_client.send_command(base64(config.main.user) + "\r\n");
                    });
                    smtp_client.on('auth_password', function() {
                        smtp_client.send_command(base64(config.main.passwd) + "\r\n");
                    });
                }
            });
        }




        var rcpt = 0;
        var send_rcpt = function () {
            if (smtp_client.is_dead_sender(plugin, connection)) {
                return;
            }
            else if (rcpt < connection.transaction.rcpt_to.length) {
                smtp_client.send_command('RCPT',
                    'TO:' + connection.transaction.rcpt_to[rcpt]);
                rcpt++;
            }
            else {
                smtp_client.send_command('DATA');
            }
        };
        smtp_client.on('mail', send_rcpt);
        if (config.main.one_message_per_rcpt) {
            smtp_client.on('rcpt', function () { smtp_client.send_command('DATA'); });
        }
        else {
            smtp_client.on('rcpt', send_rcpt);
        }

        smtp_client.on('data', function () {
            if (smtp_client.is_dead_sender(plugin, connection)) {
                return;
            }
            smtp_client.start_data(connection.transaction.message_stream);
        });

        smtp_client.on('dot', function () {
            if (smtp_client.is_dead_sender(plugin, connection)) {
                return;
            }
            else if (rcpt < connection.transaction.rcpt_to.length) {
                smtp_client.send_command('RSET');
            }
            else {
                smtp_client.call_next(OK, smtp_client.response + ' (' + connection.transaction.uuid + ')');
                smtp_client.release();
            }
        });

        smtp_client.on('rset', function () {
            if (smtp_client.is_dead_sender(plugin, connection)) {
                return;
            }
            smtp_client.send_command('MAIL',
                'FROM:' + connection.transaction.mail_from);
        });

        smtp_client.on('bad_code', function (code, msg) {
            if (smtp_client.is_dead_sender(plugin, connection)) {
                return;
            }
            smtp_client.call_next(((code && code[0] === '5') ? DENY : DENYSOFT), 
                                  msg + ' (' + connection.transaction.uuid + ')');
            smtp_client.release();
        });
    });
};

exports.hook_queue_outbound = exports.hook_queue;
