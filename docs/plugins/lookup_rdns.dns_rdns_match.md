lookup_rdns.dns_rdns_match
===========

This plugin checks the reverse-DNS and compares the resulting addresses
against forward DNS for a match.  If there is no match it sends a
DENYDISCONNECT, otherwise if it matches it sends an OK.  DENYDISCONNECT
messages are configurable.

Configuration lookup_rdns.dns_rdns_match.ini
--------------------------------------------

This is the general configuration file for the plugin.  In it you can find
ways to customize user messages, specify timeouts, and some whitelist
parsing options.

* lookup_rdns.dns_rdns_match.general.nomatch

  Text to send the user if there is no reverse to forward match (text).


* lookup_rdns.dns_rdns_match.general.timeout

  How long we should give this plugin before we time it out (seconds).


* lookup_rdns.dns_rdns_match.general.timeout_msg

  Text to send when plugin reaches timeout (text).


* lookup_rdns.dns_rdns_match.general.allow_subdomains=[1|0]

  Whether or not the hosts in `lookup_rdns.dns_rdns_match.whitelist`
  will match subdomains.


* lookup_rdns.dns_rdns_match.forward.nxdomain

  Text to send the user if there is no forward match (text).


* lookup_rdns.dns_rdns_match.forward.dnserror

  Text to send the user if there is some other error with the forward
  lookup (text).


* lookup_rdns.dns_rdns_match.reverse.nxdomain

  Text to send the user if there is no reverse match (text).


* lookup_rdns.dns_rdns_match.reverse.dnserror

  Text to send the user if there is some other error with the reverse
  lookup (text).


Configuration lookup_rdns.dns_rdns_match.timeout
------------------------------------------------

This is how we specify to Haraka that our plugin should have a certain timeout.
If you specify 0 here, then the plugin will never timeout while the connection
is active.  This is also required for this plugin, which needs to handle its
own timeouts.  To actually specify the timeout for this plugin, please see
the general config in lookup_rdns.dns_rdns_match.ini.

Configuration lookup_rdns.dns_rdns_match.whitelist
--------------------------------------------------

No matter how much you believe in checking that DNS and rDNS match, it is not
required by RFC, and there will always be some legitimate mail server that
has great trouble getting their DNS in order.  For this reason we are
providing a whitelist.

This file has two formats that can be mixed.  Each line of the file will
be tested against the connection ip and the reverse dns response.

The first format is a literal string match.  If I want to allow host
1.2.3.4 through, I can put that on one line of the whitelist file.

The second format is a regex match.  This means if I want to allow everything
from dod.net, I could put '.*\.dod\.net$' on a line.

Both formats are checked for each line, meaning the '.' in 1.2.3.4 would
match 1A2B3C4, but it is improbable that you will run into problems with this.
If you need to make sure this never happens, then please always use the
regex form of the match '1\.2\.3\.4'.

