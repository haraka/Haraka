var MessageStream = require('./messagestream');

test.expect(22);
var server = {notes: {}};

exports.get_pool(server);
var pool_name = '25:localhost:300';
test.equals(1, Object.keys(server.notes.pool).length);
test.equals(pool_name, Object.keys(server.notes.pool)[0]);
test.equals(0, server.notes.pool[pool_name].getPoolSize());
test.equals(0, server.notes.pool[pool_name].availableObjectsCount());

exports.get_client(server, function(err, smtp_client) {
    test.equals(null, err);
    test.equals(1, server.notes.pool[pool_name].getPoolSize());
    test.equals(0, server.notes.pool[pool_name].availableObjectsCount());

    var message_stream = new MessageStream(
      { main : { spool_after : 1024 } }, "123456789"
    );

    var data = [];
    var reading_body = false;
    data.push('220 hi');

    smtp_client.on('greeting', function (command) {
        test.equals(smtp_client.response[0], 'hi');
        test.equals('EHLO', command);
        smtp_client.send_command(command, 'example.com');
    });

    data.push('EHLO example.com');
    data.push('250 hello');

    smtp_client.on('helo', function () {
        test.equals(smtp_client.response[0], 'hello');
        smtp_client.send_command('AUTH', 'PLAIN AHRlc3QAdGVzdHBhc3M=');
        smtp_client.send_command('MAIL', 'FROM: me@example.com');
    });
    
    data.push('AUTH PLAIN AHRlc3QAdGVzdHBhc3M='); // test/testpass
    data.push('235 Authentication successful.');
    
    data.push('MAIL FROM: me@example.com');
    data.push('250 sender ok');

    smtp_client.on('mail', function () {
        test.equals(smtp_client.response[0], 'sender ok');
        smtp_client.send_command('RCPT', 'TO: you@example.com');
    });

    data.push('RCPT TO: you@example.com');
    data.push('250 recipient ok');

    smtp_client.on('rcpt', function () {
        test.equals(smtp_client.response[0], 'recipient ok');
        smtp_client.send_command('DATA');
    });

    data.push('DATA');
    data.push('354 go ahead');

    smtp_client.on('data', function () {
        test.equals(smtp_client.response[0], 'go ahead');
        smtp_client.start_data(message_stream);
        message_stream.on('end', function () {
          smtp_client.socket.write('.\r\n');
        });
        message_stream.add_line('Header: test\r\n');
        message_stream.add_line('\r\n');
        message_stream.add_line('hi\r\n');
        message_stream.add_line_end();
    });

     data.push('.');
     data.push('250 message queued');

    smtp_client.on('dot', function () {
        test.equals(smtp_client.response[0], 'message queued');
        smtp_client.send_command('QUIT');
    });

    data.push('QUIT');
    data.push('221 goodbye');

    smtp_client.on('quit', function () {
        test.equals(smtp_client.response[0], 'goodbye');
        test.done();
    });

    smtp_client.socket.write = function (line) {
        if (data.length == 0) {
            test.ok(false);
            return;
        }
        test.equals(data.shift() + '\r\n', line);
        if (reading_body && line == '.\r\n') {
            reading_body = false;
        }
        if (!reading_body) {
            if (line == 'DATA\r\n') {
                reading_body = true;
            }
            while (true) {
                var line = data.shift();
                this.emit('line', line + '\r\n');
                if (line[3] == ' ') break;
            }
        }

        return true;
    };

    smtp_client.socket.emit('line', data.shift());
});
