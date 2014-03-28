# `qmail_deliverable`

A client for checking the deliverability of an email
address against the [qmail-deliverabled](http://search.cpan.org/dist/Qmail-Deliverable/) daemon.

On incoming messages (relaying=false), the RCPT TO address is validated.

On outgoing messages (relaying=true) the MAIL FROM address is validated when
the `check\_outbound` option is enabled.

## Configuration

The host and port that qmail-deliverabled is listening on can be set by
altering the contents of `config/rcpt_to.qmail_deliverable.ini`

* `host` (Default: localhost)

* `port` (Default: 8998)

* `check_outbound`=true

When `check_outbound` is enabled, and a connection has relay privileges, the
MAIL FROM address is validated as deliverable.

## Per-domain Configuration

Additionally, domains can each have their own configuration for connecting
to qmail-deliverabled. The defaults are the same, so only the differences
needs to be declared. Example:

    [example.com]
    host=192.168.0.1

    [example2.com]
    host=192.168.0.2
