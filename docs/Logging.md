# Haraka Logging

Haraka has a built-in logger (described below) and a plugin hook (`log`) that lets log plugins ship messages elsewhere — for example to syslog via [haraka-plugin-syslog](https://github.com/haraka/haraka-plugin-syslog).

## Configuration

### log.ini

```ini
[main]
; data, protocol, debug, info, notice, warn, error, crit, alert, emerg
level=info

; prepend ISO-8601 timestamps to log entries (built-in logger only)
timestamps=false

; default, logfmt, json
format=default
```

### loglevel

A single-line file for quick CLI tweaks:

```sh
echo DEBUG > config/loglevel
```

When both `log.ini` and the `loglevel` file are present, whichever was edited most recently wins at runtime — `loglevel` is convenient for an interactive bump without touching `log.ini`.

### log_timestamps

A single-value file that toggles timestamp prepending. Equivalent to `main.timestamps` in `log.ini`. If either source enables timestamps, they are enabled.

## Log Levels

In ascending severity (and decreasing verbosity):

| Level    | Numeric | Use |
| -------- | ------- | --- |
| DATA     | 9       | message body bytes — extremely verbose |
| PROTOCOL | 8       | SMTP wire protocol |
| DEBUG    | 7       | developer diagnostics |
| INFO     | 6       | general informational |
| NOTICE   | 5       | normal but significant events (connect/disconnect, summary lines) |
| WARN     | 4       | recoverable problems |
| ERROR    | 3       | non-fatal errors |
| CRIT     | 2       | critical errors |
| ALERT    | 1       | needs immediate attention |
| EMERG    | 0       | unusable |

A message is emitted when its level ≤ the configured level.

## Logging API

Every log call ultimately produces:

    [level] [uuid] [origin] message

`origin` is `core` or the plugin name; `uuid` is the connection UUID (with `.N` appended for the Nth transaction).

The simplest call is on the connection or plugin object — origin and uuid are filled in automatically:

```js
connection.logdebug('turtles all the way down')
plugin.loginfo('checking sender', connection)
```

Each of the level names has a matching method:
`logdata`, `logprotocol`, `logdebug`, `loginfo`, `lognotice`, `logwarn`,
`logerror`, `logcrit`, `logalert`, `logemerg`.

Calling the logger directly works too — pass the plugin and/or connection anywhere in the arguments and the logger sniffs them:

```js
logger.logdebug('i like turtles', plugin, connection)
// → [DEBUG] [7F1C820F-…] [dnsbl] i like turtles
```

Plain objects mixed into the arguments are merged into the log record (in `logfmt` / `json` formats) or stringified (`key=value` pairs in the default format).

## Log Formats

Set `main.format` in `log.ini` to one of `default`, `logfmt`, or `json`.

`logfmt`:

    level=PROTOCOL uuid=9FF7F70E-…1 source=core message="S: 354 go ahead, make my day"

`json`:

```json
{
  "level": "PROTOCOL",
  "uuid": "9FF7F70E-…1",
  "source": "core",
  "message": "S: 354 go ahead, make my day"
}
```

A typical structured disconnect line looks like:

```json
{
  "level": "NOTICE",
  "uuid": "9FF7F70E-…1",
  "source": "core",
  "message": "disconnect",
  "ip": "127.0.0.1",
  "rdns": "Unknown",
  "helo": "3h2dnz8a0if",
  "relay": "N",
  "early": "N",
  "esmtp": "N",
  "tls": "N",
  "pipe": "N",
  "errors": 0,
  "txns": 1,
  "rcpts": "1/0/0",
  "msgs": "1/0/0",
  "bytes": 222,
  "lr": "",
  "time": 0.052
}
```

## The `log` hook

Each log message becomes a `log` hook invocation. The built-in handler writes to stdout (with ANSI colour when stdout is a TTY); log plugins can return `OK` or `STOP` to suppress the built-in output and ship the message elsewhere. Messages emitted before plugins finish loading are buffered and replayed once the plugin chain is ready.
