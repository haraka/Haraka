record_envelope_addresses
=========================

This plugin adds two new header lines.

* X-Envelope-To: the envelope RCPT TO address
* X-Envelope-From: the envelope MAIL FROM address

It is useful if you need to know the exact addresses used to send an email, e.g. when
the email was sent to you as BCC or if it is a newsletter. In both cases the recipient
address is normally not recorded in the headers.

Configuration
-------------

This plugin has no configuration.
