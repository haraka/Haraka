data.uribl
==========

This plugin extracts URIs and feeds them to RHS based blacklists such as 
[DBL][1] and [SEM-FRESH][2] and body URI based DNS blacklists such as 
[SURBL][3] and [URIBL][4].

This plugin will discard any domain name that does not have a valid TLD
or any IP address within RFC1918, 127/8 or 169.254/16 (APIPA) and will
convert any URI ending in in-addr.arpa into an IP address lookup.

Configuration
-------------

This plugin reads configuration from data.uribl.ini.

The main section defines global settings for all lists and the blacklists
zones are specified as INI section headings with the configuration for 
each zone within that section.

The main section can contain the following options:

* timeout

  Default: 30

  The total timeout in seconds for each group of lookups.  Any group of
  lookups that takes longer than this will be aborted and the session
  will continue.

* max\_uris\_per\_list                                     

  Default: 20

  This option limits the maximum number of unique lookups that will be 
  submitted for each list after the input has been normalized into the 
  query format required for the list.  
  Any lookups greater than the limit will be discarded.

List sections should be named as the zone of the blacklist and can 
contain the following options:

At least one of the following must be set for any queries to be run for
the blacklist.

* rdns = 1 | true | yes | on | enabled

  Check any rDNS names against the list.

* helo = 1 | true | yes | on | enabled

  Check the EHLO/HELO argument against the list.

* envfrom = 1 | true | yes | on | enabled

  Check the MAIL FROM domain against the list.

* from = 1 | true | yes | on | enabled

  Check the domain portion of the From: header against the list.

* replyto = 1 | true | yes | on | enabled

  Check the domain portion of the Reply-To: header against the list.

* msgid = 1 | true | yes | on | enabled

  Check the RHS of the Message-Id: header against the list.

* body = 1 | true | yes | on | enabled

  Check any URIs found within the body of the message against the list.

The following are optional for each list:

* custom\_msg

  A custom rejection message that will be returned to the SMTP client
  if the list returns a positive result.  If found within the string 
  {uri} will be replaced by the URI value looked up and {zone} will
  be replaced by the blacklist zone name.

* validate

  A regular expression that will be tested against the first A record
  returned by the list.  If it does not evaluate to true then the positive
  result will be discarded.  Example: ^(?!127\.0\.1\.255)127\. would check
  that the IP address returned start with 127. and is not 127.0.1.255

* bitmask

  This is optionally used for lists such as [SURBL][3] and [URIBL][4] that
  return bitmask values in the last octet of the returned IP address to
  combine multiple lists into a single zone.  Using this you may specify
  which lists within the zone you want use.

* no\_ip\_lookups = 1 | true | yes | on | enabled

  Specifies that no IP addresses should ever be check against this list.
  This is required for lists list dbl.spamhaus.org.

* strip\_to\_domain= 1 | true | yes | on | enabled

  Specifies that the list requires hostnames be stripped down to the
  domain boundaries prior to querying the list.  This is required for
  the [SURBL][3] and [URIBL][4] lists.

Other files
-----------

* data.uribl.excludes 

  This contains a list of domains that should never be looked up in
  any blacklist as they are known good and will never be listed.
  This helps to keep useless queries to a minimum.

[1]: http://www.spamhaus.org/dbl
[2]: http://spameatingmonkey.com/lists.html#SEM-FRESH
[3]: http://www.surbl.org/
[4]: http://www.uribl.com/
