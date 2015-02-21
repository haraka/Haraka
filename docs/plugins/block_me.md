block\_me
========

This plugin allows you to configure an address which mail sent to will be
parsed for a From: address in the body of the message, and will add that
from address to the `mail_from.blocklist` config file.

Effectively this allows your users to forward spams that got through to a
particular mailbox to block them in the future.

Note that this is a system-wide block, and not per-user. Be careful with this.

Configuration
-------------

* `config/block_me.recipient` - a file containing the address to email to
  get something blocked. For example: **spam@domain.com**.

* `config/block_me.senders` - a file containing a list of email addresses
  that are allowed to email the dropbox.
