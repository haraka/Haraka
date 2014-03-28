# `qmail_deliverable`

This plugin is a client for checking the deliverability of an email
address against the [qmail-deliverabled](http://search.cpan.org/dist/Qmail-Deliverable/) daemon.

If relaying is enabled, the MAIL FROM email address is validated. When
relaying is not enabled, the RCPT TO address is validated.

## Configuration

The host and port that qmail-deliverabled is listening on can be set by
altering the contents of `config/rcpt_to.qmail_deliverable.ini`

* host (Default: localhost)

* port (Default: 8998)

## Per-domain Configuration

Additionally, domains can each have their own configuration for connecting
to qmail-deliverabled. The defaults are the same, so only the differences
needs to be declared. Example:

    [example.com]
    host=192.168.0.1

    [example2.com]
    host=192.168.0.2
