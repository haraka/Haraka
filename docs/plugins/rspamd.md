rspamd
======

This plugin facilitates scanning messages with Rspamd.

Configuration
-------------

rspamd.ini

- host

    Default: localhost

    Host to connect to to query Rspamd.

- port

    Default: 11333

    Port Rspamd is listening on.

- reject.message

    Default: Detected as spam

    Message to send when rejecting mail due to Rspamd policy recommendation.

- reject.spam

    Default: true

    If set to false, ignore recommended *reject* action from Rspamd (except
    for authenticated users).

- reject.authenticated

    Default: false

    Reject messages from authenticated users if Rspamd recommends *reject*.

- check.authenticated

    Default: false

    If true, messages from authenticated users will not be scanned by Rspamd.

- check.private\_ip

    Default: false

    If true, messages from private IPs will not be scanned by Rspamd.

- always\_add\_headers

    Default: false

    If true, always add headers (otherwise only do this when Rspamd recommends
    *add header* action).

- header.bar

    Default: undefined

    If set, add a visual spam level in a header with this name.

- header.report

    Default: undefined

    If set, add information about symbols matched & their scores in a header
    with this name.

- header.score

    Default: undefined

    If set, add the numeric spam score in a header with this name.

- spambar.positive

    Default: +

    Used as character for visual spam-level where score is positive.

- spambar.negative

    Default: -

    Used as character for visual spam-level where score is negative.

- spambar.neutral

    Default: /

    Used as character for visual spam-level where score is zero.

- timeout (in seconds)

    Default: 29 seconds

    How long to wait for a response from rspamd.

