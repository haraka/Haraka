rcpt_to.in_host_list
====================

This plugin is the mainstay of an inbound Haraka server. It should list the
domains that are local to the host. Mails that have RCPT TO not matching
a host in the given list will be passed onto other rcpt hooks and possibly
rejected.

Configuration
-------------

* host_list
  
  Specifies the list of hosts that are local to this server.

* host_list_regex
  
  Specifies the list of regexes that are local to this server.  Please
  try to always anchor your regexes to reduce the chance of false matches.
