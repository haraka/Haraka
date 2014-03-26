
# relay\_acl

Enables IP based outbound relaying and inbound mails using destination domains.

## Configuration

* `config/relay_acl_allow`

    Allowed IP ranges in CIDR notation, one per line.
    Listed IPs are allowed to send mails without furthur checks.


## Configuration


* `config/relay_dest_domains.ini`

    Used by force_routing and dest_domains.

    Allowed destination domains. The format is in ini file, the domain
    is the key and the value is in JSON, all under the [domains] section.
    Currently supported field is "action": where the value can be
    "accept" (accept the mail without further checks), "continue" (mails
    are still subjected to further checks) or "deny" (reject the mails).

    An example:

    [domains]  
    test.com = { "action": "continue" }

    For the basics see the documentation provided by relay_acl.

    force_routing adds the field "nexthop": in the JSON value
    of the domain. The value of "nexthop": can be hostname or IP optionally
    follow by :port.

    Example:

    [domains]  
    test.com = { "action": "continue", "nexthop": "127.0.0.1:2525" }


# force_routing

Forces the next hop for configured domains.  It works much like the transport map of Postfix.


# relay\_all

Relay all is useful for spamtraps to accept all mail.

Do NOT use this plugin on a real mail server, unless you really know what
you are doing. If you use this plugin with anything that relays mail (such
as forwarding to a real mail server, or the `deliver` plugin), your mail
server is now an open relay.

This is BAD. Hence the big letters. In short: DO NOT USE THIS PLUGIN.

It is useful for testing, hence why it is here. Also I work with spamtraps
a lot, so it is useful there.
