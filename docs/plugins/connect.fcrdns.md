Forward Confirmed RDNS
================================

http://en.wikipedia.org/wiki/FCrDNS

DESCRIPTION
--------------------------
Determine if the SMTP sender has matching forward and reverse DNS.

Sets the connection note fcrdns.


CONFIGURATION
--------------------------
Edit config/connect.fcrdns.ini


WHY IT WORKS
--------------------------
The reverse DNS of zombie PCs is out of the spam operators control. Their
only way to pass this test is to limit themselves to hosts with matching
forward and reverse DNS. This presents a significant hurdle.


HOW IT'S DONE
------------------
From WikiPedia: [Forward Confirmed Reverse DNS](http://en.wikipedia.org/wiki/FcRDNS)

1. First a reverse DNS lookup (PTR query) is performed on the IP address,
   which returns a list of zero or more PTR records.

2. For each domain name returned in the PTR query results, a regular
   'forward' DNS lookup (type A or AAAA query) is then performed.

3. Any A or AAAA record returned by the second query is then compared
   against the original IP address. If there is a match, FCrDNS passes.


iprev
--------------------------

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
