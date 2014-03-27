# relay

[MTAs](http://en.wikipedia.org/wiki/Mail_transfer_agent) generally only accept mail for domains they
know they can deliver to. These domains are considered _local_. In Haraka,
`rcpt_to.*` plugins control which domains and/or email addresses are
considered deliverable.

*Relaying* is permitting others to send email to a MTA that is destined
elsewhere. Back in the day (1980s), nearly all SMTP mail servers permitted
open relaying. Soon spammers abused the open relays (1990s) and spoiled
the party. Now nearly all MTAs have relaying disabled and
[MUAs](http://en.wikipedia.org/wiki/Mail_user_agent) are required
to use a [MSA](http://en.wikipedia.org/wiki/Message_submission_agent) for relaying. Most popular MTAs have MSA features baked in.

This plugin provides Haraka with relay management options.

## Authentication

One way to enable relaying is [authentication](http://haraka.github.io/manual.html)
via the auth plugins. Successful authentication enables relaying during that
SMTP connection. To securely offer SMTP AUTH,
[tls](http://haraka.github.io/manual/plugins/tls.html) must first be enabled, and
then the AUTH SMTP extension will be advertised to SMTP clients.

To avoid port 25 restrictions, in 1998 we developed [SMTP submission](http://tools.ietf.org/html/rfc2476) on port 587. For optimal security and reliability, [MUAs](http://en.wikipedia.org/wiki/Mail_user_agent) should be configured to send mail to port 587 with TLS/SSL and AUTH enabled.

## ACL (Access Control List)

* `config/relay_acl_allow`

    Allowed IP ranges in CIDR notation, one per line.
    Listed IPs are allowed to send mails without furthur checks.

Relaying can be enabled by IP or network address. This was common at ISPs in
the 1990s. They just enabled all of their IP space to relay. That turned out
to be problematic for users who took their laptops and mobile phones and then
couldn't send mail when they weren't at home. For end users therefore,
use SMTP AUTH. See above. If you reside somewhere technology evolves more
slowly, you'd add your IP allocations to `relay_acl_allow` like so:

    echo 'N.N.N.N/24' >> /path/to/haraka/config/relay_acl_allow

A common use case for IP based relaying is to relay messages on behalf of
another mail server. If your organization has an Exchange server behind the
corporate firewall, you might use Haraka to filter the inbound messages and
also to relay (and DKIM sign) the outbound messages on their way to the
internet. For such cases, you would make sure 'acl=true' (the default) is set
in the [relay] section of `access.ini` and then add the external IP address
of the corporate firewall to `config/relay_acl_allow`:

    echo 'N.N.N.N/32' >> /path/to/haraka/config/relay_acl_allow


## Force Route / Dest[ination] Domains

These two features share a config file:

* `config/relay_dest_domains.ini`

The format is ini and entries are within the [domains] section. The key for each entry is the domain and the value is a JSON string. Within the JSON string, the currently supported keys are:

    * action  (Dest Domains)
    * nexthop (Force Route)

### Force Route

Think of force route as the equivalent of the transport map in
Postfix or the smtproutes file in Qmail. Rather than looking up the MX for a
host, the *nexthop* value from the entry in the config file is used.

The value of "nexthop": can be a hostname or IP, optionally follow by :port.

    Example:

    [domains]
    test.com = { "action": "continue", "nexthop": "127.0.0.1:2525" }

### Destination Domains

Allowed destination/recipient domains. The field within the JSON value used
by Dest Domains is "action": and the possible values are below.

Caution: enabling this option will reject mail to any domains that are not
specifically configured with an action of *continue* or *accept* in the
`config/relay_dest_domains.ini` configuration file.

    * accept   (accept the mail without further checks)

Example:

    [domains]
    test.com = { "action": "accept" }

I think of the *accept* option as the equivalent of qmail's *rcpthosts*, or
a misplaced Haraka `rcpt_to.*` plugin. The accept mechanism is just another
way to tell Haraka that a particular domain is one we accept mail for.

    * continue (mails are subject to further checks)

Because the default behavior of the Dest Routes option is to reject, the
*continue* option provides an escape, permitting another Haraka plugin to
validate the recipients of that domain.

    Example:

    [domains]
    test.com = { "action": "continue" }

POSTSCRIPT: the default deny behavior of this option baffles me.
The default behavior of Haraka is to reject emails for which some recipient
validation plugin hasn't vouched. Adding a additional default reject behavior
here necessitates the continue option for **every** other domain that will
receive mail. If the default behavior was to exit with the default next()
behavior), then this feature would play nicely with other recipient plugins
and require only one option of 'accept'.

Illustration: I have 3 domains, matt.com, matt.net, and matt.org. matt.com is
local and is delivered by qmail. matt.org is an alias of matt.com and the
`rcpt_to.qmail_deliverable` plugin will validate recipients for both
domains. Mails will get delivered as expected.

matt.net is running on a postfix server in another data center, so I enable
Force Route and Dest Domains and add this entry to `relay_dest_domains.ini`:

    [domains]
    matt.net = { "action": "accept", "nexthop": "208.N.N.N" }

Mail now gets routed properly for matt.net, but mail for matt.com and matt.org
is now broken until I add entries for them:

    [domains]
    matt.net = { "action": "accept", "nexthop": "208.N.N.N" }
    matt.com = { "action": "continue" }
    matt.org = { "action": "continue" }

Ick.

## all

Relay all is useful for spamtraps to accept all mail.

Do NOT use this on a real mail server, unless you really know what you are
doing. If you use the all feature with anything that relays mail (such
as forwarding to a real mail server, or the `deliver` plugin), your mail
server is now an open relay.

This is BAD. Hence the big letters. In short: DO NOT USE THIS FEATURE.

It is useful for testing and spamtraps, hence its presence.
