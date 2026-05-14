# Outbound Mail with Haraka

A default Haraka installation queues outbound mail to disk and delivers it to the appropriate MX for each recipient domain. Temporary failures are retried automatically using the configured backoff schedule.

A mail is treated as outbound when a plugin sets `connection.relaying` to `true`. The simplest way is SMTP AUTH using `auth/flat_file` or one of the [auth plugins](plugins/auth/); the `relay` plugin offers allow-list-based variants, and a custom plugin can apply any policy.

For live stats on the outbound queue see the [`process_title`](plugins/process_title.md) plugin.

To flush the temp-fail queue (e.g. after fixing network or DNS), send `SIGHUP` to the Haraka master process.

## Outbound Configuration

### outbound.ini

| Key | Default | Description |
| --- | --- | --- |
| `disabled` | `false` | Pause outbound delivery while still queuing inbound mail. Reloadable at runtime. |
| `concurrency_max` | `10000` | Maximum concurrent outbound deliveries **per worker**. Effective total is `concurrency_max × nodes`. |
| `enable_tls` | `true` | Use opportunistic STARTTLS on outbound. |
| `maxTempFailures` | `13` | Maximum temp-fail retries before the message bounces. Ignored if `temp_fail_intervals` is set. |
| `temp_fail_intervals` | derived | Comma-separated `<n><unit>[*<count>]` pattern. `1m, 5m*2, 1h*3` → `[60,300,300,3600,3600,3600]` seconds. `none` bounces on first temp-fail. |
| `always_split` | `false` | Create one queue file per recipient (instead of one per destination domain). Hurts throughput but simplifies bounce handling. |
| `received_header` | `Haraka outbound` | Text used in the outbound `Received:` header. Set to the literal `disabled` to omit it. |
| `connect_timeout` | `30` | Seconds to wait for TCP connect to the remote MX. |
| `local_mx_ok` | `false` | Allow outbound delivery to local/private IPs (otherwise blocked to prevent loops). |
| `inet_prefer` | `default` | `default` (prefer IPv6 at equal MX priority), `v4`, or `v6`. Delivery still follows MX priority. |

TLS configuration is shared with the `tls` plugin (`tls_key.pem`, `tls_cert.pem`, and `tls.ini`). Outbound-specific overrides go under `[outbound]` in `tls.ini`:

```ini
[outbound]
ciphers=!DES
minVersion=TLSv1.2
```

### outbound.bounce_message

Template for the bounce message body. See "Bounce Messages" below.

## The HMail Object

Most outbound hooks pass an `hmail` (HMailItem). You rarely need its methods, but these properties are useful:

| Property | Description |
| --- | --- |
| `path` | Full filesystem path to the queue file. |
| `filename` | Queue file's base name. |
| `num_failures` | Number of temp-fail attempts so far. |
| `notes` | Plain object for plugin state, scoped to this queue item. |
| `todo` | The `TODOItem` describing what to deliver (see below). |

## The TODO Object

`hmail.todo` describes the delivery:

| Property | Description |
| --- | --- |
| `mail_from` | `Address`<sup>[1](#fn1)</sup> — the envelope sender. |
| `rcpt_to` | `Address`<sup>[1](#fn1)</sup> array — envelope recipients. |
| `domain` | Recipient domain (a single domain unless `always_split` is set). |
| `notes` | The original `transaction.notes`. Keys you may set: |
| `notes.outbound_ip` | IP to bind the outbound socket to. **Set via the `get_mx` hook**, not directly. |
| `notes.outbound_helo` | EHLO domain. **Set via the `get_mx` hook**, not directly. |
| `queue_time` | When the mail was queued (epoch ms). |
| `uuid` | Inherited from the source `transaction.uuid`. |
| `force_tls` | If `true`, defer instead of delivering in plaintext. |

## Outbound Hooks

### queue_outbound

Runs before queuing. Returning `CONT` (or having no hook) queues the mail. `OK` indicates the plugin queued it itself; the `DENY*` codes reject the message.

### pre_send_trans_email

Parameters: `next, connection`

Fired by `outbound.send_trans_email()` before the transaction is serialized to disk. Useful for plugins that synthesize mail programmatically — they can attach final headers or notes here.

### send_email

Parameters: `next, hmail`

Called just before delivery starts. `next(DELAY, seconds)` defers the attempt.

### get_mx

Parameters: `next, hmail, domain`

Called when delivery begins, with the destination domain. Plugins can override MX lookup; most installs leave Haraka to do DNS. Respond with `next(OK, mx)` where `mx` is a [HarakaMx][url-harakamx] object, an array of them, or any HarakaMx-compatible input. Set `mx.auth_user` / `mx.auth_pass` to AUTH against the remote, or `mx.bind` / `mx.bind_helo`
to control source address and EHLO.

### deferred

Parameters: `next, hmail, { delay, err }`

Fired on temporary failure. Return `OK` to drop the mail silently; return `DENYSOFT, seconds` to override the retry delay (useful for custom backoff indexed on `hmail.num_failures`).

### bounce

Parameters: `next, hmail, error`

Fired on permanent failure (5xx). Not called for temp-fails. `error` may carry:

- `mx` — the MX that caused the bounce
- `deferred_rcpt` — recipients that eventually bounced after deferrals
- `bounced_rcpt` — recipients that bounced outright

Return `OK` to suppress the DSN to the original sender.

### delivered

Parameters: `next, hmail, [host, ip, response, delay, port, mode, ok_recips, secured, authenticated]`

Fired after a successful delivery. Return codes are ignored; the hook is for logging / accounting.

| Element | Description |
| --- | --- |
| `host` | Hostname of the receiving MX. |
| `ip` | IP we delivered to. |
| `response` | Remote SMTP response text (typically includes the remote queue ID). |
| `delay` | Seconds between queue write and delivery. |
| `port` | Destination port. |
| `mode` | `'smtp'` or `'lmtp'`. |
| `ok_recips` | `Address`<sup>[1](#fn1)</sup> array of successfully delivered recipients. |
| `secured` | `true` if STARTTLS succeeded. |
| `authenticated` | `true` if outbound AUTH succeeded. |

## Outbound IP Address

By default the OS routing table chooses the source IP. To pin outbound to a specific IP (per-sender, per-domain, etc.), bind that address to a local interface or alias, then set `mx.bind` (source IP) and `mx.bind_helo` (EHLO domain) in your `get_mx` hook.

## Outbound AUTH

Force AUTH for a domain or smart host by returning an MX with `auth_user` and `auth_pass` set from the `get_mx` hook. If the remote end does not advertise AUTH (or no compatible mechanism is found), delivery proceeds without AUTH and a warning is logged.

## Bounce Messages

The bounce body comes from `config/outbound.bounce_message`. Curly-brace template variables are filled in at bounce time:

- `pid` — current process id
- `date` — bounce timestamp
- `me` — contents of `config/me`
- `from` — original sender
- `msgid` — original message UUID
- `to` — original recipient (or first, for multi-recipient mail)
- `reason` — remote server's rejection text

The original message is appended to the bounce.

For HTML bounces, add `config/outbound.bounce_message_html` (and optionally an inline image in `config/outbound.bounce_message_image`).

## Generating Mail from a Plugin

To create and queue a new message from inside a plugin, use the `outbound` module:

```js
const outbound = require('./outbound')

const from = 'sender@example.com'
const to = 'user@example.com'

const contents = [
    `From: ${from}`,
    `To: ${to}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=us-ascii',
    'Subject: Hello',
    '',
    'Body here.',
    '',
].join('\n')

outbound.send_email(from, to, contents, (code, msg) => {
    switch (code) {
        case OK:
            plugin.loginfo('queued')
            break
        case DENY:
            plugin.logerror(`queue failed: ${msg}`)
            break
    }
})
```

The callback fires when the mail is **queued**, not delivered — hook `delivered` and `bounce` to observe delivery outcomes.

The callback may be omitted if you don't need to handle queue failure:

```js
outbound.send_email(from, to, contents)
```

Options accepted by `send_email(from, to, contents, next, options)`:

| Option | Description |
| --- | --- |
| `dot_stuffed: true` | Content is already SMTP dot-stuffed. |
| `notes: { … }` | Seed the new transaction's `notes`. |
| `remove_msgid: true` | Drop any existing `Message-Id:` so Haraka generates one. Useful when releasing from quarantine. |
| `remove_date: true` | Drop any existing `Date:` so Haraka generates one. |
| `origin: <object>` | Object passed to the logger to identify the source plugin / connection / HMailItem. |

To send an already-built `Transaction` directly, use `outbound.send_trans_email(transaction, next)`. This is what `send_email()` calls internally and fires the `pre_send_trans_email` hook.

<a name="fn1">1</a>: `Address` objects are [address-rfc2821](https://github.com/haraka/node-address-rfc2821) objects.

[url-tls]: plugins/tls.md
[url-harakamx]: https://github.com/haraka/haraka-net-utils?tab=readme-ov-file#harakamx
[url-rfc2821]: https://tools.ietf.org/html/rfc2821#section-4.5.2
