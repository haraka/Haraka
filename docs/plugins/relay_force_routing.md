relay_force_routing.js
========

This plugin allows you to force the next hop for the configured doamins.
It works a lot like t he transport map of Postfix.

Configuration
-------------

* `config/relay_dest_domains.ini`
    This config file is shared with relay_acl.js, for the basics see the
    documentation provided by relay_acl.js.

    relay_force_routing.js adds the field "nexthop": in  the JSON value
    of the domain. The value of "nexthop": can be hostname or IP optionally
    follow by :<port>.

    Example:

    [domains]
    test.com = { "action": "continue", "nexthop": "127.0.0.1:2525" }

