Connection Object
=================

For each connection to Haraka there is one connection object.

API
---

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

The current transaction object, valid after MAIL FROM.

