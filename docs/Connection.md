Connection Object
=================

For each connection to Haraka there is one connection object.

API
---

* connection.uuid

A unique UUID for this connection.

* connection.remote - info about the host that is connecting to Haraka.

    * ip   - remote IP address
    * host - reverse DNS of the remote hosts IP
    * is_private - true if the remote IP is from a private (loopback, RFC 1918, link local, etc.) IP address.

* connection.local - info about the host that is running Haraka

    * ip - the IP of the Haraka server, as reported by the OS
    * port - the port number handling the connection.
    * host - the rDNS host name of the local IP

* connection.proxy - proxy properties set when a proxy is used (like haproxy)
    * allowed - if the remote IP has proxy permission
    * ip - when proxied, the proxy servers IP address
    * type - currently null or 'haproxy'

* connection.hello
    * verb - Either 'EHLO' or 'HELO' whichever the remote end used
    * host - The hostname given with HELO or EHLO

* connection.notes

An object which persists during the lifetime of the connection. It is used to store connection-specific properties. See also, connection.results and [haraka-notes](https://github.com/haraka/haraka-notes).

* connection.transaction

The current transaction object, valid after MAIL FROM, and destroyed at queue
time, RSET time, or if MAIL FROM was rejected. See the Transaction Object
documentation file.

* connection.relaying

A boolean flag to say whether this connection is allowed to relay mails (i.e.
deliver mails outbound). This is normally set by SMTP AUTH, or sometimes via
an IP address check.

* connection.current\_line

For low level use. Contains the current line sent from the remote end,
verbatim as it was sent. Can be useful in certain botnet detection techniques.

* connection.last\_response

Contains the last SMTP response sent to the client.

* connection.remote\_closed

For low level use.  This value is set when the remote host drops the connection.

* connection.results

Store results of processing in a structured format. See [docs/Results](http://haraka.github.io/manual/Results.html)

