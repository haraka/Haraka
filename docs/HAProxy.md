# HAProxy PROXY Protocol Support

Haraka supports version 1 (text format) of the HAProxy [PROXY protocol][proxy-spec], which allows an upstream proxy to tell Haraka the real client IP and port. DNSBLs, allow-lists, and other IP-based plugins then see the original client rather than the proxy.

The PROXY v2 binary header is not currently supported.

## Configuration

PROXY support is disabled by default. To enable it, list the IPs (or CIDRs) of trusted proxies in `connection.ini`:

```ini
[haproxy]
hosts[] = 192.0.2.4
hosts[] = 192.0.2.5/30
hosts[] = 2001:db8::1
```

Connections from any other IP get a `DENYSOFTDISCONNECT` if they send a `PROXY` command. `DENYSOFT` is deliberate — it avoids permanently rejecting valid mail when a misconfiguration causes a legitimate proxy to fall outside the allow-list.

When a listed proxy connects, Haraka **does not** send the SMTP banner; it waits for the `PROXY` command. If none arrives within 30 seconds the connection is closed with `421 PROXY timed out`.

## What plugins see after PROXY is parsed

| Property | Value |
| --- | --- |
| `connection.remote.ip` / `.port` | the **real** client address from the PROXY header |
| `connection.local.ip` / `.port` | the destination IP/port from the PROXY header |
| `connection.proxy.allowed` | `true` |
| `connection.proxy.ip` | the proxy's address (i.e. the original socket peer) |
| `connection.proxy.type` | `'haproxy'` |
| `connection.notes.proxy` | full parsed record: `{ type, proto, src_ip, src_port, dst_ip, dst_port, proxy_ip }` |

## HAProxy configuration

You need HAProxy ≥ 1.5. The `send-proxy` option on each backend server tells HAProxy to emit the v1 header on every connection.

```
listen smtp :25
    mode tcp
    option tcplog
    balance roundrobin
    server smtp1 ip.of.haraka1:25 check-send-proxy check inter 10s send-proxy
    server smtp2 ip.of.haraka2:25 check-send-proxy check inter 10s send-proxy
```

The `check-send-proxy` flag is required for HAProxy's health checks because Haraka does not respond with a banner before the PROXY header arrives.

### Health checks

`option smtpchk` drops the connection mid-handshake and shows up as `CONNRESET` in Haraka's logs. A cleaner check is to use `tcp-check` and politely close with `QUIT`:

```
    option tcp-check
    tcp-check expect rstring ^220
    tcp-check send QUIT\r\n
    tcp-check expect rstring ^221
```

[proxy-spec]: https://www.haproxy.org/download/2.8/doc/proxy-protocol.txt
