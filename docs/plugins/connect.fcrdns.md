# Forward Confirmed Reverse DNS

## DESCRIPTION

Determine if the SMTP sender has matching forward and reverse DNS.

See [FCrDNS at wikipedia](http://en.wikipedia.org/wiki/FCrDNS)


## USAGE

Other plugins can use FCrDNS results like this:

    var fcrdns = connection.results.get('connect.fcrdns');
    if (fcrdns) {
        if (fcrdns.fcrdns) {
            // they passed, reward them
        }

        var fails = fcrdns.fail;
        if (connection.results.has('connect.fcrdns', 'fail', /^is_generic/) {
            // their IP is in their hostname, unlikely to be MX, penalize
        }
    }


## CONFIGURATION

Edit config/connect.fcrdns.ini

This plugin honors the whitelisting of IPs as set by the rdns\_access plugin.
For that to work, rdns\_access needs to be listed *before* this plugin in
config/plugins.

* timeout=30

When performing DNS lookups, time out after this many seconds.

The following settings permit control of which test will block connections. To
mimic the lookup\_rdns.strict plugin, set no\_rdns=true.

    [reject]
    ; reject if the IP address has no PTR record
    no_rdns=false

    ; reject if the FCrDNS test fails
    no_fcrdns=false

    ; reject if the PTR points to a hostname without a valid TLD
    invalid_tld=false

    ; reject if the rDNS is generic, examples:
    ; 1.2.3.4.in.addr.arpa
    ; c-67-171-0-90.hsd1.wa.comcast.net
    generic_rdns=false


## ANTI-SPAM EFFECTS

The reverse DNS of zombie PCs in bot nets is out of the bot operators control.
This presents a significant hurdle for a large portion of the hosts that
attempt spam delivery.


## HOW IT WORKS

From Wikipedia: [Forward Confirmed Reverse DNS](http://en.wikipedia.org/wiki/FCrDNS)

1. First a reverse DNS lookup (PTR query) is performed on the IP address,
   which returns a list of zero or more PTR records.

2. For each domain name returned in the PTR query results, a regular
   'forward' DNS lookup (type A or AAAA query) is then performed.

3. Any A or AAAA records returned by the second query are then compared
   against the original IP address. If there is a match, FCrDNS passes.


## iprev

The iprev results are added to the Authentication-Results header.

[RFC 1912](http://www.ietf.org/rfc/rfc1912.txt)
[RFC 5451](http://www.ietf.org/rfc/rfc5451.txt)
[RFC 7001](http://tools.ietf.org/html/rfc7001#section-3)

2.6.3.  "iprev" Results

   pass:  The DNS evaluation succeeded, i.e., the "reverse" and
      "forward" lookup results were returned and were in agreement.

   fail:  The DNS evaluation failed.  In particular, the "reverse" and
      "forward" lookups each produced results, but they were not in
      agreement, or the "forward" query completed but produced no
      result, e.g., a DNS RCODE of 3, commonly known as NXDOMAIN, or an
      RCODE of 0 (NOERROR) in a reply containing no answers, was
      returned.

   temperror:  The DNS evaluation could not be completed due to some
      error that is likely transient in nature, such as a temporary DNS
      error, e.g., a DNS RCODE of 2, commonly known as SERVFAIL, or
      other error condition resulted.  A later attempt may produce a
      final result.

   permerror:  The DNS evaluation could not be completed because no PTR
      data are published for the connecting IP address, e.g., a DNS
      RCODE of 3, commonly known as NXDOMAIN, or an RCODE of 0 (NOERROR)
      in a reply containing no answers, was returned.  This prevented
      completion of the evaluation.  A later attempt is unlikely to
      produce a final result.
