tarpit
======

This plugin is designed to introduce deliberate delays on the response 
of every hook in order to slow down a connection.  It has no 
configuration and is designed to be used only by other plugins.

It must be loaded early in config/plugins (e.g. before any plugins 
that accept recipients or that return OK) but must be loaded *after* 
any plugins that wish to use it.

To use this plugin in another plugin set:

    connection.notes.tarpit = <seconds to delay>;
    
or

    connection.transaction.notes.tarpit = <seconds to delay>;
    
When tarpitting a command it will log 'tarpitting response for Ns' to 
the INFO facility where N is the number of seconds.
