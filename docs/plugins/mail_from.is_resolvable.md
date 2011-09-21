mail_from.is_resolvable
=======================

This plugin checks that the domain used in MAIL FROM is resolvable to an MX
record.


Configuration mail_from.is_resolvable.ini
------------------------------------------

This is the general configuration file for the plugin.

* mail_from.is_resolvable.general.timeout

  How long we should give this plugin before we time it out (seconds).


* mail_from.is_resolvable.general.timeout_msg

  Text to send when plugin reaches timeout (text).


Configuration mail_from.is_resolvable.timeout
---------------------------------------------

This is how we specify to Haraka that our plugin should have a certain timeout.
If you specify 0 here, then the plugin will never timeout while the connection
is active.  This is also required for this plugin, which needs to handle its
own timeouts.  To actually specify the timeout for this plugin, please see
the general config in mail_from.is_resolvable.ini.
