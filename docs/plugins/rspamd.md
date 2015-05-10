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

- reject

    Default: true

    If set to false, ignore recommended *reject* action from Rspamd.

- reject\_message

    Default: Detected as spam

    Message to send when rejecting mail due to Rspamd policy recommendation.

- always\_add_headers

    Default: false

    If true, always add headers (otherwise only do this when Rspamd recommends
    *add header* action).

- header\_bar

    Default: undefined

    If set, add a visual spam level in a header with this name.

- header\_report

    Default: undefined

    If set, add information about symbols matched & their scores in a header
    with this name.

- header\_score

    Default: undefined

    If set, add the numeric spam score in a header with this name.

- spambar\_positive

    Default: +

    Used as character for visual spam-level where score is positive.

- spambar\_negative

    Default: -

    Used as character for visual spam-level where score is negative.

- spambar\_neutral

    Default: /

    Used as character for visual spam-level where score is zero.

