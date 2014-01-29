Migrating from Haraka v1.x to v2.x
==================================

Haraka v2.x contains two significant changes to the v1.x API related to
streams.

Streams are an abstraction over a data flow that is provided by Node core
and is used throughout node to "pipe" data between two places or more. This
makes programming very easy, and is hence why we started using them in Haraka
starting with version 2.0.0.

For more information about the Stream API, see 
http://nodejs.org/api/stream.html

It's important to note that if you are using standard Haraka plugins then
it's very unlikely you will need to change anything. Though you may want
to configure `spool_dir` and `spool_after` in `config/smtp.ini`. However if
you have written custom plugins, continue reading.

Changes To Look For
-------------------

Firstly, the incoming data in an email (the email body) is now stored in an
object which you can treat as a ReadableStream. To find if this is relevant
for you, look for instances of `data_lines` in your plugins.

Secondly, if you parse the mail body, attachments are now provided as a
stream, rather than custom start/data/end events. To find if this is relevant
for you, look for instances of `attachment_hooks` in your plugins.

Fixing data\_lines plugins
-------------------------

Any plugins now working on each line of data will need to change to using a
stream. The stream is called `transaction.message_stream`.

These changes may be complicated if you are iterating over each line and
doing something with the strings therein. However if you are piping the data
to an application or over a network, your code will become significantly
simpler (and a lot faster).

In v1.x Haraka populated the `transaction.data_lines` array for each line of 
data received.  If you were writing the data to a socket then you had to handle 
backpressure manually by checking the return of `write()` and adding 
`on('drain')` handlers like so:

    var data_marker = 0;
    var in_data = false;
    var end_pending = true;
    var send_data = function () {
        in_data = true;
        var wrote_all = true;
        while (wrote_all && (data_marker < connection.transaction.data_lines.length)) {
            var line = connection.transaction.data_lines[data_marker];
            data_marker++;
            wrote_all = socket.write(new Buffer(line.replace(/^\./, '..').replace(/\r?\n/g, '\r\n')), 'binary');
            if (!wrote_all) return;
        }
        // we get here if wrote_all still true, and we got to end of data_lines
        if (end_pending) {
            end_pending = false;
            // Finished...
            socket.send_command('dot');
        }
    };
    socket.on('drain', function () {
        if (end_pending && in_data) {
            process.nextTick(function () { send_data() });
        }
    });

In v2.x this now becomes:

    connection.transaction.message_stream.pipe(socket, {dot_stuffing: true, ending_dot: true});
    
This automatically chunks the data, handles backpressure and will apply any 
necessary format changes.  See `docs/Transaction.md` for the full details.

If you need to handle the input data by line, then you will need to create 
your own writable stream and then pipe the message to the stream and then 
extract the lines from the stream of data.  See `plugins/dkim_sign.js` for 
an example. 

Fixing attachment\_hooks plugins
-------------------------------

For v1.x you passed in functions to `transaction.attachment_hooks()` as
follows:

    transaction.attachment_hooks(
        function (ctype, filename, body) {...}, // start
        function (buf) {...}, // data
        function () {...} // end
    );

That has now changed to:

    transaction.attachment_hooks(
        function (ctype, filename, body, stream) {...}, // start
    );

This allows you to attach the stream to other streams via `stream.pipe(dest)`.

Sometimes destination streams will apply backpressure on the sending stream,
for example if you are sending attachments to a remote service. In order
for this backpressure to apply to the connection itself (so that we don't
have to buffer up data in memory), we need to provide the connection object
to the stream:
    
    var transaction = connection.transaction;
    transaction.attachment_hooks(
        function (ctype, filename, body, stream) {
            stream.connection = connection;
            ...
        }
    );

For a full example of using attachment streams, see the Transaction.md
documentation file.
