Net_Utils
=========

This module provides network utility functions.

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

    var net_utils = require('./net_utils');

    // net_utils.top_level_tlds[key]
    // net_utils.two_level_tlds[key]
    // net_utils.three_level_tlds[key]

    // Check for a TLD
    if (net_utils.top_level_tlds['com']) {
        // true 
    }

    // Split FQDN to host and domain
    var split = net_utils.split_hostname('host.sub1.sub2.domain.com');
    // split[0] = 'host.sub1.sub2';
    // split[1] = 'domain.com';

    // Does all or part of an IP address appear within a string?
    // This tests for the 1st and 2nd or 3rd and 4th octets of the IP
    // Ot the entire IP address in hex within the string
    if (net_utils.is_ip_in_str('11.22.33.44', '3344.rev.hoster.com')) {
        // true
    }

    // Convert IPv4 to long
    var long = net_utils.ip_to_long('11.22.33.44');  // 185999660

    // Convert long to IPv4
    var ip = net_utils.long_to_ip(185999660);  // 11.22.33.44

    // Convert decimal to hex
    var hex = net_utils.dec_to_hex(20111104);  // 132df00

    // Convert hex to decimal
    var dec = net_utils.hex_to_dec('132df00');  // 20111104
