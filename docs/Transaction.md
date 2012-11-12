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

* transaction.message_stream

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

* transaction.add_data(line)

Adds a line of data to the email. Note this is RAW email - it isn't useful
for adding banners to the email.

* transaction.add_line_end(cb)

Notifies the message_stream that all the data has been received.
Supply an optional callback function that will be run once any inflight data
is finished being written.

* transaction.notes

A safe place to store transaction specific values.

* transaction.add_leading_header(key, value)

Adds a header to the top of the header list.  This should only be used in
very specific cases.  Most people will want to use add_header() instead.

* transaction.add_header(key, value)

Adds a header to the email.

* transaction.remove_header(key)

Deletes a header from the email.

* transaction.header

The header of the email. See `Header Object`.

* transaction.parse_body

Set to 1 to enable parsing of the mail body. Make sure you set this in
hook_data or before.

* transaction.body

The body of the email if you set `parse_body` above. See `Body Object`.

* transaction.attachment_hooks(start, data, end)

Sets event emitter hooks for attachments if you set `parse_body` above.

The `start` event will receive `(content_type, filename, body)` as parameters.

The `data` event will receive a `Buffer` object containing some of the
attachment data.

The `end` event will be called with no parameters when an attachment ends.

Both the `data` and `end` params are optional.

Note that in the `start` event, you can set per-attachment events via:

    body.on('attachment_data', cb)
    body.on('attachment_end', cb)

* transaction.set_banner(text, html)

Sets a banner to be added to the end of the email. If the html part is not
given (optional) then the text part will have each line ending replaced with
`<br/>` when being inserted into HTML parts.
