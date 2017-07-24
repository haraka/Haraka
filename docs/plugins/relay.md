# relay

[MTAs](http://en.wikipedia.org/wiki/Mail_transfer_agent) generally only accept mail for _local_ domains they can deliver to. In Haraka, the `rcpt_to.*` plugins usually decide which domains and/or email addresses are deliverable. By default, everything else is rejected.

**Relaying** is when a MTA accepts mail that is destined elsewhere. Back in the day (1980s), most MTAs permitted open relaying. Soon spammers abused our open relays (1990s) and left us with soiled mail queues. Now nearly all MTAs have relaying disabled and [MUAs](http://en.wikipedia.org/wiki/Mail_user_agent) are required to use a [MSA](http://en.wikipedia.org/wiki/Message_submission_agent) to relay. Most MTAs (including Haraka) have MSA features and can serve both purposes.

This **relay** plugin provides Haraka with options for managing relay permissions.

## Authentication

One way to enable relaying is [authentication](http://haraka.github.io/manual.html) via the auth plugins. Successful authentication enables relaying during _that_ SMTP connection. To securely offer SMTP AUTH, the [tls](http://haraka.github.io/manual/plugins/tls.html) plugin and at least one auth plugin must be enabled and properly configured. When that requirement is met, the AUTH SMTP extension will be advertised to SMTP clients.

    % nc mail.example.com 587
    220 mail.example.com ESMTP Haraka 2.4.0 ready
    ehlo client.example.com
    250-mail.example.com Hello client.example.com [192.168.0.1], Haraka is at your service.
    250-PIPELINING
    250-8BITMIME
    250-SIZE 10000000
    250 STARTTLS
    quit
    221 mail.example.com closing connection. Have a jolly good day.

Notice that there's no AUTH advertised. We only permit authentication when the
connection is secured with TLS:

    % openssl s_client -connect mail.example.com:587 -starttls smtp
    CONNECTED(00000003)
    <snip long SSL certificate details>
    ---
    250 STARTTLS
    ehlo client.example.com
    250-mail.example.com Hello client.example.com [192.168.1.1], Haraka is at your service.
    250-PIPELINING
    250-8BITMIME
    250-SIZE 10000000
    250 AUTH PLAIN LOGIN
    quit
    221 mail.example.com closing connection. Have a jolly good day.
    closed

To avoid port 25 restrictions, in 1998 we developed [SMTP submission](http://tools.ietf.org/html/rfc2476) on port 587. For optimal security and reliability, [MUAs](http://en.wikipedia.org/wiki/Mail_user_agent) should be configured to send mail to port 587 with TLS/SSL and AUTH enabled.

## ACL (Access Control List)

ACL processing is enabled by setting acl=true in the [relay] section of
relay.ini:

    [relay]
    acl=true

With the Access Control List feature, relaying can be enabled for IPv4 and
IPv6 networks. IP ranges listed in the ACL file are allowed to send mails
without furthur checks.

* `config/relay_acl_allow`

    Allowed IP ranges in CIDR notation, one per line.

Back in the day, ISPs enabled all of their IP space to relay. That proved
problematic for users who took their laptops and mobile phones elsewhere and
then couldn't send mail. For end users therefore, use SMTP AUTH described
above. If you reside somewhere technology evolves more slowly, you can still
add IP allocations to `relay_acl_allow` like so:

    echo 'N.N.N.N/24' >> /path/to/haraka/config/relay_acl_allow

A common use case for IP based relaying is to relay messages on behalf of
another mail server. If your organization has an Exchange server, using Haraka
to filter inbound messages is a great choice. You might also want to relay
outbound messages via Haraka as well, so they can be DKIM signed on their way
to the internet. For such a use case, you would set 'acl=true' (the default)
in the [relay] section of `relay.ini` and then add the external IP address
of the corporate firewall to `config/relay_acl_allow`:

    echo 'N.N.N.N/32' >> /path/to/haraka/config/relay_acl_allow


## Force Route / Dest[ination] Domains

Force routes and Destination Domains are enabled by setting in the [relay]
section of relay.ini:

    [relay]
    force_routing=false  (default: false)
    dest_domains=false   (default: false)

These two features share another common config file:

* `config/relay_dest_domains.ini`

The format is ini and entries are within the [domains] section. The key for each entry is the domain and the value is a JSON string. Within the JSON string, the currently supported keys are:

    * action  (Dest Domains)
    * nexthop (Force Route)

### Force Route

Think of force route as the equivalent of the transport map in Postfix or the smtproutes file in Qmail. Rather than looking up the MX for a host, the *nexthop* value from the entry in the config file is used.

The value of "nexthop": can be a hostname or an IP, optionally follow by :port.

Example:

    [domains]
    test.com = { "action": "continue", "nexthop": "127.0.0.1:2525" }

### Destination Domains

Allowed destination/recipient domains. The field within the JSON value used
by Dest Domains is "action": and the possible values are accept, continue, or
deny.

    * accept   (accept the mail without further checks)

Example:

    [domains]
    test.com = { "action": "accept" }

I think of *accept* as the equivalent of qmail's *rcpthosts*, or a misplaced Haraka `rcpt_to.*` plugin. The *accept* mechanism is another way to tell Haraka that a particular domain is one we accept mail for. The difference between this and the [rcpt_to.in_host_list](http://haraka.github.io/manual/plugins/rcpt_to.in_host_list.html) plugin is that this one also enables relaying.

    * continue (mails are subject to further checks)

Example:

    [domains]
    test.com = { "action": "continue" }

Because the default behavior of Dest Routes is to deny, the *continue* option provides an escape, permitting another Haraka plugin to validate the recipient. Like the *accept* option, it too enables relaying.

    * deny    (mails are rejected)

This deny option baffles me. The default behavior of Haraka is to reject emails for
which a recipient validation plugin hasn't vouched. Adding it here prevents
any subsequent recipient validation plugin from getting a chance. It also
necessitates the continue option.


## all

Relay all is enabled by setting all=true in the [relay] section of
relay.ini:

    [relay]
    all=true     (default: false)

Relay all is useful for spamtraps to accept all mail.

Do NOT use this on a real mail server, unless you really know what you are
doing. If you use the all feature with anything that relays mail (such
as forwarding to a real mail server, or the `deliver` plugin), your mail
server is now an open relay.

This is BAD. Hence the big letters. In short: DO NOT USE THIS FEATURE.

It is useful for testing and spamtraps, hence its presence.
