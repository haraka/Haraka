## DEPRECATION NOTICE

See the [access](http://haraka.github.io/manual/plugins/access.html) plugin
for upgrade instructions.


mail\_from.access
===================

This plugin will evaluate the address against a set of white and black lists.
The lists are applied in the following way:

mail\_from.access.whitelist          (pass)
mail\_from.access.whitelist\_regex   (pass)
mail\_from.access.blacklist          (block)
mail\_from.access.blacklist\_regex   (block)

Configuration mail\_from.access.ini
-------------------------------------

General configuration file for this plugin.

* mail\_from.access.general.deny\_msg

  Text to send the user on reject (text).


Configuration mail\_from.access.whitelist
-------------------------------------------

The whitelist is mostly to counter blacklist entries that match more than
what one would want.  This file should be used for a specific address,
one per line, that should bypass blacklist checks.
NOTE: We heavily suggest tailoring blacklist entries to be as accurate as
possible and never using whitelists.  Nevertheless, if you need whitelists,
here they are.

Configuration mail\_from.access.whitelist\_regex
-------------------------------------------------

Does the same thing as the whitelist file, but each line is a regex.
Each line is also anchored for you, meaning '^' + regex + '$' is added for
you.  If you need to get around this restriction, you may use a '.*' at
either the start or the end of your regex.  This should help prevent people
from writing overly permissive rules on accident.

Configuration mail\_from.access.blacklist
-------------------------------------------

This file should be used for a specific address, one per line, that should
fail on connect.

Configuration mail\_from.access.blacklist\_regex
-------------------------------------------------

Does the same thing as the blacklist file, but each line is a regex.
Each line is also anchored for you, meaning '^' + regex + '$' is added for
you.  If you need to get around this restriction, you may use a '.*' at
either the start or the end of your regex.  This should help prevent people
from writing overly permissive rules on accident.
