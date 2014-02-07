relay\_all
=========

This plugin is useful in spamtraps to accept mail to any host, and to allow
any user from anywhere to send email.

Do NOT use this plugin on a real mail server, unless you really know what
you are doing. If you use this plugin with anything that relays mail (such
as forwarding to a real mail server, or the `deliver` plugin), your mail
server is now an open relay.

This is BAD. Hence the big letters. In short: DO NOT USE THIS PLUGIN.

It is useful for testing, hence why it is here. Also I work with spamtraps
a lot, so it is useful there.
