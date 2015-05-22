# bounce

Provide options for bounce processing.

## Configuration

Each feature can be enabled/disabled with a true/false toggle in the [check]
section of `config/bounce.ini`:

Some features can have rejections disabled in the [reject] section.

    [check]
    reject_all=false
    single_recipient=true
    empty_return_path=true
    bad_rcpt=true
    non_local_msgid=true

    [reject]
    single_recipient=true
    empty_return_path=true
    non_local_msgid=false

## Features

### reject\_all

When enabled, blocks all bounce messages using the simple rule of checking
for `MAIL FROM:<>`.

It is generally a bad idea to block all bounces. This option can be useful
for mail servers at domains with frequent spoofing and few or no human users.

### single\_recipient

Valid bounces have a single recipient. Assure that the message really is a
bounce by enforcing bounces to be addressed to a single recipient.

### empty\_return\_path

Valid bounces should have an empty return path. Test for the presence of the
Return-Path header in bounces and disallow.

### bad\_rcpt

Disallow bounces to email addresses listed in `config/bounce_bad_rcpt`.

Include email addresses in that file that should *never* receive bounce
messages. Examples of email addresses that should be listed are:
autoresponders, do-not-reply@example.com, dmarc-feedback@example.com, and
any other email addresses used solely for machine generated messages.

