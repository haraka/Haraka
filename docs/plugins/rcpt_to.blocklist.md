rcpt_to.blocklist
===================

This plugin blocks RCPT_TO addresses in a list.

NOTE: If all you need is to deny mail based on the exact address, this plugin
will work just fine.  If you want to customize the deny message, add blocks
based on a regex, or add whitelists, please use the rcpt_to.access plugin.

Configuration
-------------

* rcpt_to.blocklist
  
  Contains a list of email addresses to block.
