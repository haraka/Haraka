# Haraka Logging

Haraka has built-in logging (see API docs below) and support for log plugins. This page pertains to the built in logging. For log plugins like ([haraka-plugin-syslog](https://github.com/haraka/haraka-plugin-syslog)), refer to the plugin's docs.

* log.ini

Contains settings for log level, timestamps, and format. See the example log.ini file for examples.

* loglevel

The loglevel file provides a finger-friendly way to change the loglevel on the CLI. Use it like so: `echo DEBUG > config/loglevel`. When the level in log.ini is set and the loglevel file is present, the loglevel file wins. During runtime, whichever was edited most recently wins.

## Logging API

Logging conventions within Haraka

See also
------------------
[https://github.com/haraka/Haraka/pull/119](https://github.com/haraka/Haraka/pull/119)

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
