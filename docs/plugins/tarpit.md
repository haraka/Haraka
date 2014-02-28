tarpit
======

This plugin is designed to introduce deliberate delays on the response
of every hook in order to slow down a connection.  It has no
configuration and is designed to be used only by other plugins.

It must be loaded early in config/plugins (e.g. before any plugins
that accept recipients or that return OK) but must be loaded *after*
any plugins that wish to use it.


Usage
--------------
To use this plugin in another plugin set:

    connection.notes.tarpit = <seconds to delay>;

or

    connection.transaction.notes.tarpit = <seconds to delay>;


Configuration
--------------
config/tarpit.timeout - How long Haraka lets the plugin do nothing before it times out.

If *seconds to delay* is longer than tarpit.timeout (default: 1s), you'll get errors like this in your log files:

    [core] Plugin tarpit timed out on hook rcpt - make sure it calls the callback
    [core] Plugin tarpit timed out on hook quit - make sure it calls the callback

The solution is to set the tarpit plugin timeout to **seconds to delay** + 1.
Example for use with a 5 second tarpit delay:

    echo '6' > config/tarpit.timeout


Logging
--------------
When tarpitting a command it will log 'tarpitting response for Ns' to
the INFO facility where N is the number of seconds.
