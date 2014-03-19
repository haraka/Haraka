# qmail\_deliverable

This plugin implements a client for checking the deliverability of an email
address against the qmail-deliverabled daemon. 
See http://search.cpan.org/dist/Qmail-Deliverable/


## Configuration

You can modify the host/port that qmail-deliverabled is listening on by
altering the contents of config/rcpt\_to.qmail\_deliverable.ini

* host (Default: localhost)

* port (Default: 8998)

## Per-domain routing

Additionally, domains can each have their own routing instructions for
connecting to qmail-deliverabled. The defaults are the same, so only the
differences needs to be declared. Example:

    [example.com]
    host=192.168.0.1

    [example2.com]
    host=192.168.0.2
