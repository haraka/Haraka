lookup_rdns.dns_rdns_match
===========

This plugin checks the reverse-DNS and compares the resulting addresses
against forward DNS for a match.  If there is no match it sends a
DENYDISCONNECT, otherwise if it matches it sends an OK.  DENYDISCONNECT
messages are configurable.

Configuration
-------------

* lookup_rdns.dns_rdns_match.general.nomatch

  Text to send the user if there is no reverse to forward match.

* lookup_rdns.dns_rdns_match.forward.nxdomain

  Text to send the user if there is no forward match.

* lookup_rdns.dns_rdns_match.forward.dnserror

  Text to send the user if there is some other error with the forward lookup.

* lookup_rdns.dns_rdns_match.reverse.nxdomain

  Text to send the user if there is no reverse match.

* lookup_rdns.dns_rdns_match.reverse.dnserror

  Text to send the user if there is some other error with the reverse lookup.
