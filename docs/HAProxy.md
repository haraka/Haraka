# HAProxy PROXY protocol extension support

Haraka supports PROXY protocol [1].

This allows an upstream proxy to pass the IP address and port of the remote client. Haraka will use the remote IP instead of the socket IP address (which is the proxy). This allows DNSBLs and access control lists to use the correct source address.

Support is disabled by default. Attempts to send a PROXY command will return a DENYSOFTDISCONNECT error. DENYSOFT is used to prevent configuration errors from rejecting valid mail.

To enable support for PROXY you must populate connection.ini[haproxy]hosts[] with the IP addresses of the HAProxy hosts that MUST send the PROXY command. Ranges can be specified with CIDR notation.

When a proxy host connects to Haraka, a banner is not sent. Instead Haraka awaits the PROXY command. The connection will timeout with `421 PROXY timed out` if the command is not sent within 30 seconds.

NOTE: because Haraka does not send a banner when a listed HAProxy host connects you must set check-send-proxy to ensure that the service checks send a PROXY command before they run.

[1] http://haproxy.1wt.eu/download/1.5/doc/proxy-protocol.txt

HAProxy supports the PROXY protocol in version 1.5 or later.

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

The important part is `send-proxy` which causes HAProxy to send the PROXY extension on connection.

When using `option smtpchk` you will see CONNRESET errors reported in the Haraka logs as smtpchk drops the connection before the HELO response is still being written. You can use the `option tcp-check` instead to provide a better service check by having the check wait for the banner, send QUIT and then check the response:

```
        option tcp-check
        tcp-check expect rstring ^220\ 
        tcp-check send QUIT\r\n
        tcp-check expect rstring ^221\ 
```
