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

    You can also define a default relay using the "any" domain, which will be
    used if the message's destination domain doesn't match any of the domains
    already defined.

    Example:
```
    [domains]  
    test.com = { "action": "continue", "nexthop": "127.0.0.1:2525" }
    my.test.com = { "action": "continue", "nexthop": "127.0.0.1:2527" }
    any = { "action": "continue", "nexthop": "10.10.10.1:2525"}
```
