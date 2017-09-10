queue/lmtp
========

This plugin delivers inbound mail via LMTP.

## Configuration

LMTP is enabled by adding `queue/lmtp` to config/plugins. LMTP delivery is configured in `config/lmtp.ini` . By default, all inbound messages are forwarded to the host specified in the `[main]` section. Domain specific routes can be specified by creating additional sections with the same host/port or path options.

### lmtp.ini

```ini
; defaults
host=localhost
port=24

[example1.com]
; Goes elsewhere
host=10.1.1.1
port=2400

[example2.com]
; Using unix domain sockets
path = /tmp/blah_com_socket
```

