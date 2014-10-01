dkim_verify
===========

This plugin will verify DKIM signatures as defined by RFC 6376 and add
an Authentication-Results header as appropriate.


Configuration
-------------

There is no configuration required for this plugin.


Testing
-------

This plugin also provides a command-line test tool that can be used to 
debug DKIM issues or to check results.

````
# dkimverify < message
identity="@gmail.com" domain="gmail.com" result=pass
````

You can add `--debug` to the option arguments to see a full trace of the processing.


Notes
-----

This plugin and underlying library does not currently support DKIM body length limits (l=).
