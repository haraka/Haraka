rcpt_to.in_host_list
====================

This plugin is the mainstay of an inbound Haraka server. It should list the
domains that are local to the host. Mails that have RCPT TO not matching
a host in the given list will be passed onto other rcpt hooks and possibly
rejected.

Configuration
-------------

* host_list
  
  Specifies the list of hosts that are local to this server.  This can be
  a simple list of hosts, or it can be a regex.

* host_list.ini

  Specifies the following sub-configuration:
  
  * allow_subdomains=[1|0]
  
    Whether or not the hosts in `host_list` will match subdomains.
    
