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
file which should contain a list of IP addresses of the HAProxy hosts
that should be allowed to send the PROXY command. A range of IP
addresses can be specified by it's CIDR network address.

When a host connects to Haraka that matches an IP address present in the
`haproxy_hosts` file - a banner is not sent, instead Haraka waits for the
PROXY command to be sent before proceeding.  The connection will timeout
with `421 PROXY timed out` if the command is not sent within 30 seconds.

NOTE: because Haraka does not send a banner when a listed HAProxy host
connects you must set check-send-proxy to ensure that the service checks
send a PROXY command before they run.

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
        server smtp1 ip.of.haraka.server1:25 check-send-proxy check inter 10s send-proxy
        server smtp2 ip.of.haraka.server2:25 check-send-proxy check inter 10s send-proxy
        server smtp3 ip.of.haraka.server3:25 check-send-proxy check inter 10s send-proxy
        server smtp4 ip.of.haraka.server4:25 check-send-proxy check inter 10s send-proxy
        server smtp5 ip.of.haraka.server5:25 check-send-proxy check inter 10s send-proxy
```

The important part is `send-proxy` which causes HAProxy to send the PROXY
extension on connection.

When using `option smtpchk` you will see CONNRESET errors reported in the Haraka logs as
smtpchk drops the connection before the HELO reponse is still being written.
You can use the `option tcp-check` instead to provide a better service check by having
the check wait for the banner, send QUIT and then check the response:

```
        option tcp-check
        tcp-check expect rstring ^220\ 
        tcp-check send QUIT\r\n
        tcp-check expect rstring ^221\ 
```
