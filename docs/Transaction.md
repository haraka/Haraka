# Transaction Object

An SMTP transaction begins at `MAIL FROM` and ends at `RSET` or end-of-data (the "final dot"). A connection can carry multiple transactions; the current one is available as `connection.transaction`.

## Properties

### transaction.uuid

A unique UUID for this transaction, of the form `<connection.uuid>.N`, where `N` increments per transaction on the connection.

### transaction.mail_from

The `MAIL FROM` argument as an [`Address`][address] object.

### transaction.rcpt_to

An array of [`Address`][address] objects, one per accepted `RCPT TO`.

### transaction.header

The parsed message header. See [haraka-email-message → Header](https://github.com/haraka/email-message#header).

### transaction.body

The parsed message body, available only when `parse_body` is `true`. See [haraka-email-message → Body](https://github.com/haraka/email-message#body).

### transaction.message_stream

A Node.js `Readable` stream for the message (headers + body). Pipe it into any `Writable` — a socket, file, stdout, or your own stream:

```js
transaction.message_stream.pipe(writable, options)
```

`options` may override:

| Option         | Default  | Description |
| -------------- | -------- | --- |
| `line_endings` | `"\r\n"` | newline sequence |
| `dot_stuffed`  | `true`   | emit SMTP dot-stuffed output |
| `ending_dot`   | `false`  | terminate with `.\r\n` (SMTP end-of-data) |
| `end`          | `true`   | call `.end()` on the writable when finished |
| `buffer_size`  | `65535`  | internal buffer size |
| `clamd_style`  | `false`  | ClamAV CLAMSCAN-INSTREAM framing |

```js
transaction.message_stream.pipe(socket, { ending_dot: true })
```

### transaction.data_bytes

Number of bytes received during `DATA`.

### transaction.parse_body

`false` by default. Set to `true` (in `hook_data` or earlier) to enable MIME body parsing, after which `transaction.body` becomes available. `attachment_hooks()`, `set_banner()`, and `add_body_filter()` set this automatically.

### transaction.discard_data

Set to `true` to drop the raw message as it arrives instead of buffering it in `message_stream`. The parsed body and attachments are still available when `parse_body` is `true`. Useful for plugins that only need attachments or text without retaining the whole message.

### transaction.notes

A `haraka-notes` instance scoped to this transaction. Use it to pass state between hooks; for structured per-test output prefer `transaction.results`. See [haraka-notes](https://github.com/haraka/haraka-notes).

`transaction.notes.skip_plugins` is honoured by the plugin runner — push plugin names into it to bypass them for the remainder of the transaction.

### transaction.results

Structured store for plugin results. See [haraka-results](https://github.com/haraka/haraka-results).

### transaction.rcpt_count

Per-disposition counters (`accept`, `tempfail`, `reject`) tracking recipients in this transaction.

### transaction.mime_part_count

Number of MIME parts seen so far (when `parse_body` is enabled).

### transaction.encoding

Character encoding used to convert incoming bytes to strings. Defaults to `'utf8'`.

## Methods

### transaction.add_header(key, value)

Append a header to the message.

### transaction.add_leading_header(key, value)

Prepend a header to the message. Most plugins want `add_header()`; use this only when ordering matters (e.g. `Received:` chains).

### transaction.remove_header(key)

Remove all headers with `key`.

### transaction.add_data(line)

Append a raw line to the message. The input must already be in SMTP wire format (CRLF newlines, dot-stuffed). Not the right tool for adding banners or transforming body parts — see `set_banner()` and `add_body_filter()`.

### transaction.attachment_hooks(start)

Register a callback fired for each attachment. `start` is called with `(content_type, filename, body, stream)`; `stream` is a Node.js `Readable`. Setting `stream.connection = connection` applies backpressure to the SMTP connection so attachments can be processed before the message ends.

```js
exports.hook_data = (next, connection) => {
    connection.transaction.attachment_hooks((ct, fn, body, stream) => {
        start_att(connection, ct, fn, body, stream)
    })
    next()
}

function start_att(connection, ct, fn, body, stream) {
    connection.loginfo(`attachment: ${ct} ${fn}`)
    stream.connection = connection // enable backpressure
    stream.pause()

    require('node:tmp').file((err, path, fd) => {
        const ws = require('node:fs').createWriteStream(path)
        stream.pipe(ws)
        stream.resume()
    })
}
```

### transaction.set_banner(text, html)

Append a banner to the end of the message. If `html` is omitted, each newline in `text` is replaced with `<br/>\n` when inserted into HTML parts.

### transaction.add_body_filter(ct_match, filter)

Register a filter applied to body parts. `ct_match` is either a regex matched against the content-type line, or a string matched as a prefix (e.g. `/^text\/html/` or `'text/plain'`). `filter` receives `(content_type, encoding, buffer)` and must return a `Buffer` with the replacement body (in the same encoding).

[address]: https://github.com/haraka/node-address-rfc2821
