## DEPRECATION NOTICE

See [haraka-plugin-access](https://github.com/haraka/haraka-plugin-access)
for upgrade instructions.

# rcpt_to.access

This plugin blocks RCPT_TO addresses in a list or regex.
This plugin will evaluate the RCPT_TO address against a set of white and black
lists. The lists are applied in the following way:

rcpt_to.access.whitelist (pass)
rcpt_to.access.whitelist_regex (pass)
rcpt_to.access.blacklist (block)
rcpt_to.access.blacklist_regex (block)

## Configuration rcpt_to.access.ini

General configuration file for this plugin.

- rcpt_to.access.general.deny_msg

  Text to send the user on reject (text).

## Configuration rcpt_to.access.whitelist

The whitelist is mostly to counter blacklist entries that match more than
what one would want. This file should be used for a specific address
one per line, that should bypass blacklist checks.
NOTE: We heavily suggest tailoring blacklist entries to be as accurate as
possible and never using whitelists. Nevertheless, if you need whitelists,
here they are.

## Configuration rcpt_to.access.whitelist_regex

Does the same thing as the whitelist file, but each line is a regex.
Each line is also anchored for you, meaning '^' + regex + '$' is added for
you. If you need to get around this restriction, you may use a '.\*' at
either the start or the end of your regex. This should help prevent people
from writing overly permissive rules on accident.

## Configuration rcpt_to.access.blacklist

This file should be used for a specific address, one per line, that should
fail on connect.

## Configuration rcpt_to.access.blacklist_regex

Does the same thing as the blacklist file, but each line is a regex.
Each line is also anchored for you, meaning '^' + regex + '$' is added for
you. If you need to get around this restriction, you may use a '.\*' at
either the start or the end of your regex. This should help prevent people
from writing overly permissive rules on accident.
