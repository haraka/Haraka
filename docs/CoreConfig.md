# Core Configuration Files

Haraka reads the configuration files in this document directly. Plugins typically own their own files (named after the plugin); see the individual plugin docs.

See also [Logging](Logging.md), [HAProxy](HAProxy.md), and [Outbound](Outbound.md).

## smtp.yaml / smtp.json

If either of these files exists it is loaded first. It uses the YAML/JSON override mechanism from [haraka-config](https://github.com/haraka/haraka-config) and can provide the entire configuration as a single file.

## plugins

A newline-delimited list of plugins to load. Lines starting with `#` are ignored.

## smtp.ini

Controls the SMTP listener and the master process.

| Key | Default | Description |
| --- | --- | --- |
| `listen` | `[::0]:25` | Comma-separated `IP:port` pairs to listen on (e.g. `127.0.0.1:25,127.0.0.1:587`). |
| `listen_host` / `port` | — | Legacy. If set, a `<listen_host>:<port>` entry is prepended to `listen`. Prefer `listen`. |
| `smtps_port` | `465` | Port used by the optional implicit-TLS listener. |
| `public_ip` | none | The server's public IP. Helps NAT-aware plugins (SPF, GeoIP) when Haraka is behind NAT. If `stun` is on `$PATH` Haraka will try to discover it automatically. |
| `inactivity_timeout` | `300` | Idle seconds before a client socket is dropped. |
| `nodes` | `1` | Number of worker processes to fork. The string `cpus` forks one per CPU. |
| `user` / `group` | — | User and group to drop privileges to (name or numeric ID). |
| `ignore_bad_plugins` | `0` | If `1`, Haraka starts even if some plugins fail to compile. |
| `daemonize` | `false` | If `true`, fork into the background at start-up. |
| `daemon_log_file` | `/var/log/haraka.log` | Where to redirect stdout/stderr when daemonized. |
| `daemon_pid_file` | `/var/run/haraka.pid` | Where to write the PID file. |
| `graceful_shutdown` | `false` | If `true`, wait for in-flight sockets on shutdown. |
| `force_shutdown_timeout` | `30` | Seconds to wait before forcing shutdown. |

## me

A single-line file containing the server name used in `Received:` headers
and elsewhere. Defaults to `hostname(1)`.

## connection.ini

Per-connection limits and behaviours. See inline comments in the shipped
`config/connection.ini` for full details.

| Section / Key | Default | Description |
| --- | --- | --- |
| `main.spool_dir` | `/tmp` | Directory for temporary spool files. |
| `main.spool_after` | `-1` | Size (bytes) at which to spool the message to disk. `-1` never spools; `0` always spools. |
| `main.strict_rfc1869` | `false` | Reject `MAIL FROM` / `RCPT TO` that violates RFC 1869/821 (spurious spaces, missing brackets). |
| `main.smtputf8` | `true` | Advertise `SMTPUTF8` (RFC 6531). |
| `haproxy.hosts` | empty | Array of IPs/CIDRs allowed to send the PROXY protocol. See [HAProxy.md](HAProxy.md). |
| `headers.add_received` | `true` | Add a `Received:` header to incoming mail. |
| `headers.clean_auth_results` | `true` | Strip inbound `Authentication-Results:` headers before plugins run. |
| `headers.show_version` | `true` | Include the Haraka version in the SMTP banner and the `Received:` header. |
| `headers.max_lines` | `1000` | Maximum number of header lines accepted. |
| `headers.max_received` | `100` | Maximum number of `Received:` headers before mail is rejected as looping. |
| `max.bytes` | `26214400` | Maximum message size (advertised as the `SIZE` ESMTP extension). |
| `max.line_length` | `512` | SMTP command line length cap. Clients exceeding this are dropped with `521`. |
| `max.data_line_length` | `992` | Maximum line length in `DATA`. Longer lines are wrapped with `CRLF SPACE` (Sendmail behaviour) and `transaction.notes.data_line_length_exceeded` is set. |
| `max.mime_parts` | `1000` | Maximum MIME parts per message. |
| `message.greeting` | — | Array. Lines used as the SMTP greeting banner. |
| `message.helo` | `Haraka is at your service.` | Reply text for `HELO` / `EHLO`. |
| `message.close` | `closing connection. …` | Reply text on `QUIT`. |
| `uuid.banner_chars` | `6` | Number of UUID chars included in the SMTP banner (`0` to disable, `40` for the full UUID). |
| `uuid.deny_chars` | `0` | Number of UUID chars prepended (in brackets) to deny messages. |

## plugin_timeout

Single-integer file. Seconds to allow a plugin hook to run before Haraka
automatically advances to the next hook. Default: `30`.

A per-plugin override may be placed at `config/<plugin>.timeout`. A value
of `0` disables the timeout for that plugin — use with care. Plugins in
subdirectories need a matching path: `queue/smtp_forward` looks for
`config/queue/smtp_forward.timeout`.

## outbound.ini

Configures the outbound delivery engine. The most common keys are listed
below; see [Outbound.md](Outbound.md) for the full set.

| Key | Default | Description |
| --- | --- | --- |
| `disabled` | `false` | Disable outbound delivery entirely. |
| `concurrency_max` | `100` | Maximum simultaneous outbound deliveries. |
| `enable_tls` | `true` | Use STARTTLS opportunistically on outbound deliveries. |
| `maxTempFailures` | `13` | Number of temporary failures before a message bounces. |
| `always_split` | `false` | Create one queue file per recipient instead of one per destination domain. |
| `received_header` | `Haraka outbound` | Value used in the outbound `Received:` header. |
| `inet_prefer` | `default` | IP family preference for MX lookups: `v4`, `v6`, or `default` (OS preference). |

## outbound.bounce_message

Template used when an outbound message bounces. The default is usually fine. Available template variables are documented in the source of `outbound/hmail.js`.
