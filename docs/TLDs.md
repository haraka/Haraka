TLDs
====

This module provides functions to split a hostname into host 
and domain/TLD parts and for checking to see if a name matches 
on one of the lists.

This is useful for validating input or finding administrative 
boundaries.

Files
-----

This module depends on the following files to function:

* top-level-tlds

  Contains the list of TLDs valid on the internet.
  Updates to this list can be found at:
  http://data.iana.org/TLD/tlds-alpha-by-domain.txt

* two-level-tlds

  Contains the list of 2nd level TLDs.
  Updates to this list can be found at:
  http://george.surbl.org/two-level-tlds

* three-level-tlds

  Contains a list of 3rd level TLDs.
  Updates to this list can be found at:
  http://www.surbl.org/tld/three-level-tlds

* extra-tlds

  This allows for additional 2nd and 3rd level TLDs to be
  from a single file.  Used for site customizations or
  for the URIBL hosters.txt that can be updated from:
  http://rss.uribl.com/hosters/hosters.txt

Usage
-----

    var tlds = require('./tlds');

    // tlds.top_level_tlds[key]
    // tlds.two_level_tlds[key]
    // tlds.three_level_tlds[key]

    // Check for a TLD
    if (tlds.top_level_tlds['com']) {
        // true 
    }

    // Split FQDN to host and domain
    var split = tlds.split_hostname('host.sub1.sub2.domain.com');
    // split[0] = 'host.sub1.sub2';
    // split[1] = 'domain.com';

