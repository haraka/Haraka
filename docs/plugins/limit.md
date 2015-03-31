# limit

Connection limits for Haraka.

Each limit type has a max value that can be defined in limit.ini. The default is empty / disabled until a value has been set.

## concurrency

When `[concurrency]max` is defined, it limits the maximum number of simultaneous connections per IP address. Connection attempts in excess of the limit are delayed for `disconnect_delay` seconds (default: 3) before being disconnected.

### History

History: when enabled, the `history` setting is the name of a plugin that stores IP history results. The result store must have a positive value for good connections and negative integers for poor / undesirable connections. At present, karma is the only such plugin.


## recipients

When `[recipients]max` is defined, each connection is limited to that number of recipients. The limit is imposed against **all** recipient attempts. Attempts in excess of the limit are issued a temporary failure.


## unrecognized_commands

When `[unrecognized_commands]max` is set, a connection that exceeeds the limit is disconnected.


## errors

When `[errors]max` is set, a connection that exceeeds the limit is disconnected. Errors that count against this limit include:

* issuing commands out of turn (MAIL before EHLO, RCPT before MAIL, etc)
* attempting MAIL on port 465/587 without AUTH
* MAIL or RCPT addresses that fail to parse

