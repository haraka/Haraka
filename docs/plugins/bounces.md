bounce
===================
This plugin provides options for bounce processing.


# Configuration

## - reject\_all (default: false)

Blocks all bounce messages using the simple rule of checking
for `MAIL FROM:<>`.

This is useful to enable if you have a mail server that gets spoofed too
much but very few legitimate users. It is potentially bad to block all
bounce messages, but unfortunately for some hosts, sometimes necessary.


## - reject\_invalid (default: true)

Assure that the message really is a bounce by enforcing that any bounce
(message with an empty return path) is addressed to a single recipient.


## - invalid\_addrs

Include email addresses in this section that should *never* receive bounce
messages. Examples of email addresses that should be listed here are:
autoresponders, do-not-reply@example.com, dmarc-feedback@example.com, and
any other email addresses used solely for machine generated messages.
