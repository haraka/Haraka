queue/deliver
=============

This plugin is the key to making Haraka an outbound delivering mail server.

Mails that are recognised as relaying (e.g. via an AUTH plugin or otherwise),
when queued via this plugin, will be stored in a queue for outbound delivery
according to the rules in RFC 5321 (or RFC 2821). The recipient's MX records
will be looked up and the mail delivered the the relevant host.

Configuration
-------------

* deliver.queue_dir

  The directory to queue mails in. Mails are stored as files with a
  timestamp and number of failures in the filename. Default: ./queue.

* deliver.bounce_message
  
  The bounce message should delivery of the mail fail. See the source of the
  plugin for the default. Bounce messages contain a number of template
  replacement values which are best discovered by looking at the source code.
