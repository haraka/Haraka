relay\_acl
========

This plugin makes it possible to relay outbound mails using IP based ACLs
and relay inbound mails using destination domains.

Configuration
-------------

* `config/relay_acl_allow`
    Allowed IP ranges in CIDR notation, one per line.
    IPs listed in here will be allowed to send mails without any furthur
    checks.

* `config/relay_dest_domains.ini`
    Allowed destination domains. The format is in ini file, the domain
    is the key and the value is in JSON, all under the [domains] section.
    Currently supported field is "action": where the value can be
    "accept" (accept the mail without further checks), "continue" (mails
    are still subjected to further checks) or "deny" (reject the mails).

    An example:

    [domains]  
    test.com = { "action": "continue" }

    Please note that this config/relay\_dest\_domains.ini is shared with
    plugins/relay\_force\_routing.js, which uses additional fields.

