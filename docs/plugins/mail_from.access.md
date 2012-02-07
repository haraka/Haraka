mail_from.access
===================

This plugin will evaluate the address against a set of white and black lists.
The lists are applied in the following way:

mail_from.access.whitelist         (pass)
mail_from.access.whitelist_regex   (pass)
mail_from.access.blacklist         (block)
mail_from.access.blacklist_regex   (block)

Configuration mail_from.access.ini
-------------------------------------

General configuration file for this plugin.

* mail_from.access.general.deny_msg

  Text to send the user on reject (text).


Configuration mail_from.access.whitelist
-------------------------------------------

The whitelist is mostly to counter blacklist entries that match more than
what one would want.  This file should be used for a specific address,
one per line, that should bypass blacklist checks.
NOTE: We heavily suggest tailoring blacklist entries to be as accurate as
possible and never using whitelists.  Nevertheless, if you need whitelists,
here they are.

Configuration mail_from.access.whitelist_regex
-------------------------------------------------

Does the same thing as the whitelist file, but each line is a regex.
Each line is also anchored for you, meaning '^' + regex + '$' is added for
you.  If you need to get around this restriction, you may use a '.*' at
either the start or the end of your regex.  This should help prevent people
from writing overly permissive rules on accident.

Configuration mail_from.access.blacklist
-------------------------------------------

This file should be used for a specific address, one per line, that should
fail on connect.

Configuration mail_from.access.blacklist_regex
-------------------------------------------------

Does the same thing as the blacklist file, but each line is a regex.
Each line is also anchored for you, meaning '^' + regex + '$' is added for
you.  If you need to get around this restriction, you may use a '.*' at
either the start or the end of your regex.  This should help prevent people
from writing overly permissive rules on accident.
