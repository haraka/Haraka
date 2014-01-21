relay\_force\_routing.js
========

This plugin allows you to force the next hop for the configured domains.
It works a lot like the transport map of Postfix.

Configuration
-------------

* `config/relay_dest_domains.ini`
    This config file is shared with relay\_acl.js, for the basics see the
    documentation provided by plugins/relay\_acl.js.

    relay\_force\_routing.js adds the field "nexthop": in the JSON value
    of the domain. The value of "nexthop": can be hostname or IP optionally
    follow by :port.

    Example:

    [domains]  
    test.com = { "action": "continue", "nexthop": "127.0.0.1:2525" }

