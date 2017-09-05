Transaction Object
==================

An SMTP transaction is valid from MAIL FROM time until RSET or "final-dot".

API
---

* transaction.uuid

A unique UUID for this transaction. Is equal to the connection.uuid + '.N'
where N increments for each transaction on this connection.

* transaction.mail\_from

The value of the MAIL FROM command as an `Address` object.

* transaction.rcpt\_to

An Array of `Address` objects of recipients from the RCPT TO command.

* transaction.message\_stream

A node.js Readable Stream object for the message.

You use it like this:

    transaction.message_stream.pipe(WritableStream, options)

Where WritableStream is a node.js Writable Stream object such as a
net.socket, fs.writableStream, process.stdout/stderr or custom stream.

The options argument should be an object that overrides the following
properties:

    * line_endings (default: "\r\n")
    * dot_stuffing (default: false)
    * ending_dot   (default: false)
    * end          (default: true)
    * buffer_size  (default: 65535)
    * clamd_style  (default: false)

e.g.

    transaction.message_stream.pipe(socket, { dot_stuffing: true, ending_dot: true });

* transaction.data\_bytes

The number of bytes in the email after DATA.

* transaction.add\_data(line)

Adds a line of data to the email. Note this is RAW email - it isn't useful
for adding banners to the email.

* transaction.notes

A safe place to store transaction specific values. See also [haraka-results](https://github.com/haraka/haraka-results) and [haraka-notes](https://github.com/haraka/haraka-notes).

* transaction.add\_leading\_header(key, value)

Adds a header to the top of the header list.  This should only be used in
very specific cases.  Most people will want to use `add_header()` instead.

* transaction.add\_header(key, value)

Adds a header to the email.

* transaction.remove\_header(key)

Deletes a header from the email.

* transaction.header

The header of the email. See `Header Object`.

* transaction.parse\_body = true|false [default: false]

Set to `true` to enable parsing of the mail body. Make sure you set this in
hook\_data or before.

* transaction.body

The body of the email if you set `parse_body` above. See `Body Object`.

* transaction.attachment\_hooks(start)

Sets a callback for when we see an attachment if `parse_body` has been set.

The `start` event will receive `(content_type, filename, body, stream)` as
parameters.

The stream is a `ReadableStream` - see http://nodejs.org/api/stream.html for
details on how this works.

If you set stream.connection then the stream will apply backpressure to the
connection, allowing you to process attachments before the connection has
ended. Here is an example which stores attachments in temporary files using
the `tmp` library from npm and tells us the size of the file:

    exports.hook_data = function (next, connection) {
        // enable mail body parsing
        connection.transaction.parse_body = 1;
        connection.transaction.attachment_hooks(
            function (ct, fn, body, stream) {
                start_att(connection, ct, fn, body, stream)
            }
        );
        next();
    }

    function start_att (connection, ct, fn, body, stream) {
        connection.loginfo("Got attachment: " + ct + ", " + fn + " for user id: " + connection.transaction.notes.hubdoc_user.email);
        connection.transaction.notes.attachment_count++;

        stream.connection = connection; // Allow backpressure
        stream.pause();

        var tmp = require('tmp');

        tmp.file(function (err, path, fd) {
            connection.loginfo("Got tempfile: " + path + " (" + fd + ")");
            var ws = fs.createWriteStream(path);
            stream.pipe(ws);
            stream.resume();
            ws.on('close', function () {
                connection.loginfo("End of stream reached");
                fs.fstat(fd, function (err, stats) {
                    connection.loginfo("Got data of length: " + stats.size);
                    // Close the tmp file descriptor
                    fs.close(fd, function(){});
                });
            });
        });
    }

* transaction.discard\_data = true|false [default: false]

Set this flag to true to discard all data as it arrives and not store in
memory or on disk (in the message\_stream property). You can still access
the attachments and body if you set parse\_body to true. This is useful
for systems which do not need the full email, just the attachments or
mail text.

* transaction.set\_banner(text, html)

Sets a banner to be added to the end of the email. If the html part is not
given (optional) then the text part will have each line ending replaced with
`<br/>` when being inserted into HTML parts.

* transaction.add\_body\_filter(ct_match, filter)

Adds a filter to be applied to body parts in the email.  ct\_match should be a
regular expression to match against the full content-type line, or a string to
match at the start, e.g. `/^text\/html/` or `'text/plain'`.  filter will be
called when each body part matching ct_match is complete.  It receives three
parameters, the content-type line, the encoding name, and a buffer with the
full body part.  It should return a buffer with the desired contents of the
body in the same encoding.

* transaction.results

Store results of processing in a structured format. See [docs/Results](http://haraka.github.io/manual/Results.html)
