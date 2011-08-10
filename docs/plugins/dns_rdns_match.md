dns_rdns_match
===========

This plugin checks the reverse-DNS and compares the resulting addresses
against forward DNS for a match.  If there is no match it sends a
DENYDISCONNECT, otherwise if it matches it sends an OK.  DENYDISCONNECT
messages are configurable.

Configuration
-------------

* dns_rdns_match.general.nomatch

  Text to send the user if there is no reverse to forward match.

* dns_rdns_match.general.type

  The version of records this server cares about for forward lookups.  That is
  does the server want 'A' or 'AAAA' records.  default is 'A'.

* dns_rdns_match.forward.nxdomain

  Text to send the user if there is no forward match.

* dns_rdns_match.forward.dnserror

  Text to send the user if there is some other error with the forward lookup.

* dns_rdns_match.reverse.nxdomain

  Text to send the user if there is no reverse match.

* dns_rdns_match.reverse.dnserror

  Text to send the user if there is some other error with the reverse lookup.
