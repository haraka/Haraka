HAProxy PROXY protocol extension support
========================================

Haraka natively supports the PROXY protocol [1].

This allows an upstream proxy to pass IP address and port of the client which
Haraka will use instead of the socket IP address (which is of the proxy).
This allows DNSBLs and access control lists to operate on the proxied address.

Support is disabled by default and if HAProxy or other attempts to send a
PROXY command then Haraka will return a DENYSOFTDISCONNECT error.
DENYSOFT is used to prevent configuration errors from rejecting valid mail.

To enable support for PROXY you must create a `haproxy_hosts` configuration
file which should contain a list of IP or CIDRs that should be allowed to
send the PROXY command.   As PROXY must be sent as soon as the socket is
opened - if this file contains one or more entries then a short banner delay 
is applied (default: 250ms) to allow for the PROXY command to be sent once 
the socket is connected.

If you have HAProxy hosts that are remote and are on connections with higher
latency then you may need to increase the banner delay greater than 250ms,
you can do this by creating a configuration file named `haproxy_banner_delay` 
which should contain the number of milliseconds of delay that should be 
applied.

[1] http://haproxy.1wt.eu/download/1.5/doc/proxy-protocol.txt

HAProxy supports the PROXY protocol in version 1.5 or later however there
are patches available to add support for 1.4.

Here is an example listener section for haproxy.cfg:

```
listen smtp :25
        mode tcp
        option tcplog
        option smtpchk
        balance roundrobin
        server smtp1 ip.of.haraka.server1:25 check inter 10s send-proxy
        server smtp2 ip.of.haraka.server2:25 check inter 10s send-proxy
        server smtp3 ip.of.haraka.server3:25 check inter 10s send-proxy
        server smtp4 ip.of.haraka.server4:25 check inter 10s send-proxy
        server smtp5 ip.of.haraka.server5:25 check inter 10s send-proxy
```

The important part is `send-proxy` which causes HAProxy to send the PROXY
extension on connection.
