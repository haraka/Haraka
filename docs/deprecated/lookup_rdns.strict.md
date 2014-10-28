lookup\_rdns.strict
===========

This plugin checks the reverse-DNS and compares the resulting addresses
against forward DNS for a match.  If there is no match it sends a
DENYDISCONNECT, otherwise if it matches it sends an OK.  DENYDISCONNECT
messages are configurable.

Configuration lookup\_rdns.strict.ini
--------------------------------------------

This is the general configuration file for the plugin.  In it you can find
ways to customize user messages, specify timeouts, and some whitelist
parsing options.

* lookup\_rdns.strict.general.nomatch

  Text to send the user if there is no reverse to forward match (text).


* lookup\_rdns.strict.general.timeout

  How long we should give this plugin before we time it out (seconds).


* lookup\_rdns.strict.general.timeout\_msg

  Text to send when plugin reaches timeout (text).


* lookup\_rdns.strict.forward.nxdomain

  Text to send the user if there is no forward match (text).


* lookup\_rdns.strict.forward.dnserror

  Text to send the user if there is some other error with the forward
  lookup (text).


* lookup\_rdns.strict.reverse.nxdomain

  Text to send the user if there is no reverse match (text).


* lookup\_rdns.strict.reverse.dnserror

  Text to send the user if there is some other error with the reverse
  lookup (text).


Configuration lookup\_rdns.strict.timeout
------------------------------------------------

This is how we specify to Haraka that our plugin should have a certain timeout.
If you specify 0 here, then the plugin will never timeout while the connection
is active.  This is also required for this plugin, which needs to handle its
own timeouts.  To actually specify the timeout for this plugin, please see
the general config in lookup\_rdns.strict.ini.

Configuration lookup\_rdns.strict.whitelist
--------------------------------------------------

No matter how much you believe in checking that DNS and rDNS match, it is not
required by RFC, and there will always be some legitimate mail server that
has great trouble getting their DNS in order.  For this reason we are
providing a whitelist.

This file will match exactly what you put on each line.


Configuration lookup\_rdns.strict.whitelist\_regex
--------------------------------------------------------

Does the same thing as the whitelist file, but each line is a regex.
Each line is also anchored for you, meaning '^' + regex + '$' is added for
you.  If you need to get around this restriction, you may use a '.*' at
either the start or the end of your regex.  This should help prevent people
from writing overly permissive rules on accident.
