# Connection Object

For each connection to Haraka there is one connection object. It is the first argument passed to almost every plugin hook and is the primary context object plugins use to inspect and act on the SMTP session.

## Properties

### connection.uuid

A unique UUID for this connection. Used as the connection identifier in logs and inherited by `transaction.uuid`.

### connection.remote

Information about the host connecting to Haraka.

- `ip` — remote IP address
- `port` — remote TCP port
- `host` — reverse DNS of the remote IP (populated by the `connect.rdns_access` / `connect` hooks)
- `info` — free-form descriptor (e.g. populated by FCrDNS)
- `closed` — `true` once the remote end has dropped the connection
- `is_private` — `true` if the remote IP is in a private range (RFC 1918, loopback, link-local, etc.)
- `is_local` — `true` if the remote IP is localhost / loopback

### connection.local

Information about the Haraka server endpoint handling this connection.

- `ip` — the IP of the Haraka server, as reported by the OS
- `port` — the port number handling the connection
- `host` — the primary host name of the Haraka server
- `info` — `Haraka` (with `/<version>` appended when `headers.show_version` is enabled in `connection.ini`)

### connection.hello

The greeting given by the client.

- `verb` — `EHLO` or `HELO`, whichever the client used
- `host` — the hostname argument

### connection.tls

State of the TLS layer on this connection.

- `enabled` — `true` once STARTTLS has been negotiated (or the listener is `smtps`)
- `advertised` — `true` if Haraka advertised STARTTLS in the EHLO response
- `verified` — `true` if the peer certificate validated against the configured CAs
- `cipher` — the negotiated cipher object (`name`, `version`, …)
- `verifyError` — the verification error, if any
- `peerCertificate` — the parsed peer certificate (when client certs are used)

### connection.proxy

Proxy-protocol state, set when the connection arrived via HAProxy (see [HAProxy.md](HAProxy.md)).

- `allowed` — `true` if the remote IP is in the `haproxy.hosts` allow-list
- `ip` — the proxy server's IP (the real client IP appears in `connection.remote.ip` once PROXY is parsed)
- `type` — currently `null` or `'haproxy'`

### connection.notes

A plain object that persists for the lifetime of the connection. Use it to share state between plugin hooks. For structured per-test results prefer `connection.results`. See also [haraka-notes](https://github.com/haraka/haraka-notes).

### connection.results

Structured store for plugin results. See [haraka-results](https://github.com/haraka/haraka-results).

### connection.transaction

The current `Transaction` object. Valid between `MAIL FROM` and the end of `queue` / `RSET` (or until `MAIL FROM` is rejected). See [Transaction.md](Transaction.md).

### connection.relaying

Boolean. `true` if this connection is allowed to relay (i.e. deliver mail outbound). Normally set by an auth plugin or an IP allow-list. Reading or writing this property transparently routes through the current transaction when one exists, so the flag survives across multiple messages in a single connection only when set on the connection.

### connection.capabilities

Array of ESMTP capabilities advertised in the EHLO response (e.g. `['PIPELINING', '8BITMIME', 'SIZE 0', 'STARTTLS', 'AUTH PLAIN LOGIN']`). Plugins may push additional capability strings during the `capabilities` hook.

### connection.esmtp

`true` if the client used `EHLO` (as opposed to `HELO`).

### connection.pipelining

`true` once Haraka has advertised, and the client has used, SMTP pipelining.

### connection.early_talker

`true` if the client sent data before Haraka issued its banner — a
common spam-bot signal.

### connection.tran_count

Number of transactions completed on this connection.

### connection.rcpt_count / connection.msg_count

Per-disposition counters (`accept`, `tempfail`, `reject`) tracking
recipients and full messages on this connection.

### connection.start_time

Connection start time, in epoch milliseconds (`Date.now()`).

### connection.last_response

The last SMTP response line Haraka sent to the client.

### connection.last_reject

The text of the last rejection issued to this client (used by
`max_unrecognized_commands` and similar throttling plugins).

### connection.errors

Count of protocol errors on this connection.

### connection.current_line

Low-level. The current line as sent by the remote end, verbatim. Useful
for botnet fingerprinting.

### connection.state

The connection's protocol state — one of the values in `haraka-constants`'s `connection.state` table (`PAUSE`, `CMD`, `LOOP`, `DATA`, `DISCONNECTING`, `DISCONNECTED`).

## Methods

### connection.respond(code, msg, cb)

Send an SMTP response to the client. `code` is the numeric SMTP code, `msg` is the human-readable text (a string or an array of strings for a multi-line response). The callback fires when the response has been written.

### connection.disconnect()

Close the connection after running the `disconnect` hook.

### connection.reset_transaction(cb)

Tear down the current transaction (equivalent to `RSET`) and invoke `cb` when complete.

### connection.set(path, value)

Assign a nested property safely, e.g. `connection.set('remote.host', 'mx.example.com')`. Setting `remote.ip`
automatically recomputes `remote.is_private` / `remote.is_local`.

### connection.get(path)

Read a nested property, returning `undefined` if any segment is missing.

### connection.loginfo / lognotice / logwarn / logerror / logdebug / logcrit / logalert / logemerg / logprotocol / logdata

Log at the named level. Each takes either `(msg)` or `(plugin, msg, data)`.

See [Logging.md](Logging.md).
