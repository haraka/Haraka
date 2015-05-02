# limit

Apply several types of limits to SMTP connections.

Each limit type has a max value that can be defined in limit.ini. The default is empty / disabled until a value has been set.

## concurrency

When `[concurrency]max` is defined, it limits the maximum number of simultaneous connections per IP address. Connection attempts in excess of the limit are delayed for `disconnect_delay` seconds (default: 3) before being disconnected.

This works best in conjunction with a history / reputation database, so that
one can assign very low concurrency (1) to bad or unknown senders and higher
limits for reputable mail servers.

### History

History: when enabled, the `history` setting is the name of a plugin that stores IP history / reputation results. The result store must have a positive value for good connections and negative integers for poor / undesirable connections. Karma is one such plugin.


## recipients

When `[recipients]max` is defined, each connection is limited to that number of recipients. The limit is imposed against **all** recipient attempts. Attempts in excess of the limit are issued a temporary failure.


## unrecognized_commands

When `[unrecognized_commands]max` is set, a connection that exceeeds the limit is disconnected.

Unrecognized commands are normally SMTP verbs invalidly issued by the client.
Examples:

* issuing AUTH when we didn't advertise AUTH extension
* issuing STARTTLS when we didn't advertise STARTTLS
* invalid SMTP verbs


### Limitations

The unrecognized_command hook is used by the `tls` and `auth` plugins, so
running this plugin before those would result in valid operations getting
counted against that connections limits. The solution is simple: list
`limit` in config/plugins after those.


## errors

When `[errors]max` is set, a connection that exceeeds the limit is disconnected. Errors that count against this limit include:

* issuing commands out of turn (MAIL before EHLO, RCPT before MAIL, etc)
* attempting MAIL on port 465/587 without AUTH
* MAIL or RCPT addresses that fail to parse

# Error Handling

## Too high counters

If the NoSQL store is Redis and Haraka is restarted or crashes while active
connections are open, the concurrency counters might be inflated. This is
handled by the [concurrency]reset setting (default: 10m), which:

* ssc: sets collection expiration time
* redis: empties the concurrency hash
* RAM: empties the in-memory hash of all keys

## Too low counters

Because the redis and RAM objects are emptied periodically, connections that
are open while the collections are emptied will be too low. When
that happens, log messages like these might be emitted:

    resetting 0 to 1
    resetting -1 to 1

This is a harmless error condition that is repaired automatically.
