
Logging API
==================

Logging conventions within Haraka

See also
------------------
https://github.com/baudehlo/Haraka/pull/119

logline will always always be in the form:

    [level] [connection uuid] [origin] message

where origin is "haraka\_core" or the name of the plugin which
triggered the message, and "connection uuid" is the ID of the
connection associated with the message.

when calling a log method on logger, you should provide the
plugin object and the connection object anywhere in the arguments
to the log method.

    logger.logdebug("i like turtles", plugin, connection);

will yield, for example,

    [DEBUG] [7F1C820F-DC79-4192-9AA6-5307354B20A6] [dnsbl] i like turtles

if you call the log method on the connection object, you can
forego the connection as argument:

    connection.logdebug("turtles all the way down", plugin);

and similarly for the log methods on the plugin object:

    plugin.logdebug("he just really likes turtles", connection);

failing to provide a connection and/or plugin object will leave
the default values in the log (currently "core" and
"no\_connection").

this is implemented by testing for argument type in
the logger.js log\* method. objects-as-arguments are then sniffed
to try to determine if they're a connection or plugin instance.


