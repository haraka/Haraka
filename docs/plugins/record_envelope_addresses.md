record\_envelope\_addresses
=========================

This plugin adds two new header lines.

* X-Envelope-To: the envelope RCPT TO address
* X-Envelope-From: the envelope MAIL FROM address

It is useful if you need to know the exact addresses used to send an email, e.g. when
the email was sent to you as BCC or if it is a newsletter. In both cases the recipient
address is normally not recorded in the headers.

Caveats
-------

If you enable this plugin you may introduce a possible information leak, i.e. disclosure
of BCC recipients. So you never want to use this on an outgoing mail server and maybe also
not if this server is used as a relay.

Configuration
-------------

This plugin has no configuration.
