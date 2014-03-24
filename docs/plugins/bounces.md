# bounce

Provide options for bounce processing. The following features are available:

* reject\_all

When enabled, blocks all bounce messages using the simple rule of checking
for `MAIL FROM:<>`.

This is useful to enable if you have a mail server that gets spoofed too
much but very few legitimate users. It is potentially bad to block all
bounce messages, but unfortunately for some hosts, sometimes necessary.


# Configuration

## [check]

Each feature can be enabled/disabled with a true/false toggle in the [check]
section of config/bounce.ini:

    [check]
    reject_all=false
    single_recipient=true
    empty_return_path=true
    bad_rcpt=true

* single\_recipient

Valid bounces have a single recipient. Assure that the message really is a
bounce by enforcing bounces to be addressed to a single recipient.

* empty\_return\_path

Valid bounces should have an empty return path. Test for the presence of the
Return-Path header in bounces and disallow.

* bad\_rcpt

Disallow bounces to email addresses listed in config/bounce\_bad\_rcpt.

Include email addresses in that file that should *never* receive bounce
messages. Examples of email addresses that should be listed are:
autoresponders, do-not-reply@example.com, dmarc-feedback@example.com, and
any other email addresses used solely for machine generated messages.

## [reject]

config/bounce.ini can have a [reject] section that toggles rejections on or
off for the following checks:

    single_recipient=true
    empty_return_path=true
