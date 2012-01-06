Connection Object
=================

For each connection to Haraka there is one connection object.

API
---

* connection.uuid

A unique UUID for this connection.

* connection.remote_ip

The remote IP address

* connection.remote_host

The rDNS of the remote IP

* connection.greeting

Either 'EHLO' or 'HELO' whichever the remote end used

* connection.hello_host

The hostname given to HELO or EHLO

* connection.notes

A safe object in which you can store connection-specific variables

* connection.transaction

The current transaction object, valid after MAIL FROM, and destroyed at queue
time, RSET time, or if MAIL FROM was rejected. See the Transaction Object
documentation file.

* connection.relaying

A boolean flag to say whether this connection is allowed to relay mails (i.e.
deliver mails outbound). This is normally set by SMTP AUTH, or sometimes via
an IP address check.

* connection.current_line

For low level use. Contains the current line sent from the remote end,
verbatim as it was sent. Can be useful in certain botnet detection techniques.

* connection.last_response

Contains the last SMTP response sent to the client.

* connection.remote_close

For low level use.  This value is set when the remote host drops the connection.
