## DEPRECATION NOTICE

See the [access](http://haraka.github.io/manual/plugins/access.html) plugin
for upgrade instructions.


rcpt\_to.access
===================

This plugin blocks RCPT\_TO addresses in a list or regex.
This plugin will evaluate the RCPT\_TO address against a set of white and black
lists.  The lists are applied in the following way:

rcpt\_to.access.whitelist          (pass)
rcpt\_to.access.whitelist\_regex   (pass)
rcpt\_to.access.blacklist          (block)
rcpt\_to.access.blacklist\_regex   (block)

Configuration rcpt\_to.access.ini
-------------------------------------

General configuration file for this plugin.

* rcpt\_to.access.general.deny\_msg

  Text to send the user on reject (text).

Configuration rcpt\_to.access.whitelist
-------------------------------------------

The whitelist is mostly to counter blacklist entries that match more than
what one would want.  This file should be used for a specific address
one per line, that should bypass blacklist checks.
NOTE: We heavily suggest tailoring blacklist entries to be as accurate as
possible and never using whitelists.  Nevertheless, if you need whitelists,
here they are.

Configuration rcpt\_to.access.whitelist\_regex
-------------------------------------------------

Does the same thing as the whitelist file, but each line is a regex.
Each line is also anchored for you, meaning '^' + regex + '$' is added for
you.  If you need to get around this restriction, you may use a '.*' at
either the start or the end of your regex.  This should help prevent people
from writing overly permissive rules on accident.

Configuration rcpt\_to.access.blacklist
-------------------------------------------

This file should be used for a specific address, one per line, that should
fail on connect.

Configuration rcpt\_to.access.blacklist\_regex
-------------------------------------------------

Does the same thing as the blacklist file, but each line is a regex.
Each line is also anchored for you, meaning '^' + regex + '$' is added for
you.  If you need to get around this restriction, you may use a '.*' at
either the start or the end of your regex.  This should help prevent people
from writing overly permissive rules on accident.
