spf
===

This plugin implements RFC 4408 Sender Policy Framework (SPF)
See the [Wikipedia article on SPF](http://en.wikipedia.org/wiki/Sender_Policy_Framework) for details.

By default this plugin with only add trace Received-SPF headers to a message.
To make it reject mail then you will need to enable the relevant options below.
`[deny]helo_fail` and `[deny]mfrom_fail` are the closest match for the intent
of SPF but you will need to whitelist any hosts forwarding mail from another
domain whilst preserving the original return-path.

Configuration
-------------

This plugin uses spf.ini for configuration and the following options are
available:

    [relay]
    context=sender   (default: sender)

On connections with relaying privileges (MSA or mail relay), it is often
desirable to evaluate SPF from the context of Haraka's public IP(s), in the
same fashion the next mail server will evaluate it when we send to them.
In that use case, Haraka should use context=myself.

    * context=sender    evaluate SPF based on the sender (connection.remote\_ip)
    * context=myself    evaluate SPF based on Haraka's public IP

The rest of the optional settings (disabled by default) permit deferring or
denying mail from senders whose SPF fails the checks.

### Things to Know

* Most senders do not publish SPF records for their mail server *hostname*,
  which means that the SPF HELO test rarely passes. During observation in 2014,
  more spam senders have valid SPF HELO than ham senders. If you expect very
  little from SPF HELO validation, you might still be disappointed.

* Enabling error deferrals will cause excessive delays and perhaps bounced
  mail for senders with broken DNS. Enable this only if you are willing to
  delay and sometimes lose valid mail.

* Broken SPF records by valid senders are common. Keep that in mind when
  considering denial of SPF error results. If you deny on error, budget
  time for instructing senders on how to correct their SPF records so they
  can email you.

* The only deny option most sites should consider is `mfrom_fail`. That will
  reject messages that explicitely fail SPF tests. SPF failures have a high
  correlation with spam. However, up to 10% of ham transits forwarders and/or
  email lists which frequently break SPF. SPF results are best used as inputs
  to other plugins such as DMARC, [spamassassin](http://haraka.github.io/manual/plugins/spamassassin.html), and [karma](http://haraka.github.io/manual/plugins/karma.html).

* Heed well the implications of SPF, as described in [RFC 4408](http://tools.ietf.org/html/rfc4408#section-9.3)

    [defer]
    helo_temperror
    mfrom_temperror

    [deny]
    helo_softfail
    helo_fail
    helo_permerror

    mfrom_softfail
    mfrom_fail
    mfrom_permerror

    ; SPF settings used when connection.relaying=true
    [defer_relay]
    helo_temperror
    mfrom_temperror

    [deny_relay]
    helo_softfail
    helo_fail
    helo_permerror

    mfrom_softfail
    mfrom_fail
    mfrom_permerror



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

### SPF Resource Record Type

Node does not support the SPF DNS Resource Record type. Only TXT records are
checked.

This is a non-issue as < 1% (as of 2014) of SPF records use the SPF RR type.
Due to lack of adoption, the next SPF revision will like likely deprecate the
SPF RR type.
