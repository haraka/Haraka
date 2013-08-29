spf
===

This plugin implements RFC 4408 Sender Policy Framework (SPF)
See the [Wikipedia article on SPF](http://en.wikipedia.org/wiki/Sender_Policy_Framework) for details.

NOTE: as Node.js does not support the SPF DNS record type, only TXT records are checked.

By default this plugin with only add trace Received-SPF headers to a message.
To make it reject mail then you will need to enable the relevant options below.
`helo_fail_reject` and `mail_fail_reject` are the closest match for the intent of SPF but you will need
to whitelist any hosts forwarding mail from another domain whilst preserving the original return-path.

Configuration
-------------

This plugin uses spf.ini for configuration and each option is documented below:

- helo_softfail_reject

    Default: false

    Return DENY if the SPF HELO check returns SoftFail.
    This option should only be enabled in exceptional circumstances.

- helo_fail_reject

    Default: false

    Return DENYSOFT if the SPF HELO check returns Fail.

- helo_temperror_defer

    Default: false

    Return DENYSOFT if the SPF HELO check returns TempError.
    This can cause excessive delays if a domain has a broken SPF record or any issues with their DNS configuration.

- helo_permerror_reject

    Default: false

    Return DENY if the SPF HELO check returns Fail.
    This can cause false-positives if a domain has any syntax errors in their SPF record.

- mail_softfail_reject

    Default: false

    Return DENYSOFT if the SPF MAIL check returns SoftFail.
    This option should only be used in exceptional circumstances.

- mail_fail_reject

    Default: false

    Return DENY if the SPF MAIL check returns Fail.

- mail_temperror_defer

    Default: false

    Return DENYSOFT if the SPF MAIL check returns TempError.
    This can cause excessive delays if a domain has a broken SPF record or any issues with their DNS configuration.

- mail_permerror_reject

    Default: false

    Return DENY if the SPF MAIL check returns Fail.
    This can cause false-positives if a domain has any syntax errors in their SPF record.


Testing
-------

This plugin also provides a command-line test tool that can be used to debug SPF issues or to check results.

To check the SPF record for a domain:

````
# spf --ip 1.2.3.4 --domain fsl.com
ip=1.2.3.4 helo="" domain="fsl.com" result=Fail
````

To check the SPF record for a HELO/EHLO name:

````
# spf --ip 1.2.3.4 --helo foo.bar.com
ip=1.2.3.4 helo="foo.bar.com" domain="" result=None
````

You can add `--debug` to the option arguments to see a full trace of the SPF processing.
