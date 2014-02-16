
karma
===========================
A heuristic scoring engine that uses connection metadata and the results
of other Haraka plugins as inputs. Mail scoring above defined thresholds
are penalized in certain ways.


Description
---------------------------
A strength of Haraka is inclusion of plugins that detect message or sender behavior that indicates spam. Some plugins have accuracy rates above 95%. Whether those plugins can be used depends on a sites tolerance for blocking a few percent of legitimate messages. Sites that can't are unable to benefit from those plugins.

Karma takes a holistic view of the connection, expecting *every* plugin to tolerate failures and store their results. During the connection, karma collects the results and applies the awards defined in karma.ini. Combining several "95+" plugins can reliably drive accuracy rates above 99%. Known good senders can fail a test or two and still get their valid mail delivered. Fail too many tests though and goodbye!

Connection data that karma considers:

* IP reputation
* ASN reputation (the network 'neighborhood')
* denials issued by other plugins
* envelope sender has a spammy TLD
* envelope addresses are malformed
* unrecognized SMTP commands are sent
* too many recipients are attempted
* too many concurrent connections are attempted

The data from these tests are helpful but the real power of karma is scoring
the results of other plugins. See karma.ini for a rich set of examples.


POLICIES
---------------------------
Karma can be used to craft custom connection policies such as these examples:

1. Hi well known and well behaved sender. You can have 10 concurrent
   connections, send a message to up-to 50 recipients, with no delay.

2. Hi bad sender. You get a one concurrent connection, up to 5 recipients, and
   a 5 second delay between SMTP commands.


IP Reputation
-----------------------
Karma records the number of good, bad, and total connections. When a sender
has more bad than good connections, they can be penalized for *penalty\_days*.
Connections from senders in the penalty box are rejected until the penalty
expires.

Karma stores results that other plugins can use.

    var karma = connection.results.get('karma');

The karma results contains at least the following:

    connect: 0,       <- score for this connection
    history: 0,       <- score for all connections
    pass: [],         <- tests that added positive karma
    fail: [],         <- tests that added negative karma


Neighbor Reputation
-----------------------
If *asn\_enable* is true, karma records the number of good and bad connections
from each ASN. If *asn\_award* is numeric > 0, that many karma awards are applied
to future connections from that ASN. Most of the time, you want to keep this
award low (1 or 2), unless you're purposefully trying to block entire networks.


HISTORY
-----------------------
Karma history is computed as the number of good - bad connections.


CONFIG
====================

See config/karma.ini. It has lots of options and inline documentation.


AWARDS
--------------------
Karma allows the site administrator to control how much weight to assign to
the plugin results, providing a great deal of control over what results are
worth rejecting for.

Karma begins scoring the connection when the first packet arrives. The IP
reputation, sender OS, GeoIP location, presence on a DNSBL, and FCrDNS are
often a sufficient basis for rejecting a connection without ever passing a
false positive.

Karma performs checks early and often, greatly reducing the time
spent "on the hook" with bad mailers.


KARMA
------------------------
When the connection ends, *karma* records the result. Mail servers whose
bad connections exceed good ones are sent to the penalty box. Servers in
the penalty box are tersely disconnected for *penalty\_days*. See the section
on penalty\_box.

If only negative karma is set, desirable mailers will be penalized. For
example, a Yahoo user sends an egregious spam to a user on our server.
Now nobody on our server can receive email from that Yahoo server for
*penalty\_days*. This will happen approximately 0% of the time if we also
set positive karma.


PENALTY BOX
------------------------

Here is a sample connection from an IP in the penalty box:

    [core] connect ip=173.234.145.190 port=9472 local_ip=127.0.0.30 local_port=25
    [connect.asn] asn: 15003, net: 173.234.144.0/21, country: US, authority: arin
    [connect.fcrdns] 173.234.145.190.rdns.ubiquity.io(Error: queryA ENOTFOUND)
    [connect.fcrdns] ip=173.234.145.190 rdns="173.234.145.190.rdns.ubiquity.io" rdns_len=1 fcrdns="" fcrdns_len=0 other_ips_len=0 invalid_tlds=0 generic_rdns=true
    [connect.p0f] os="Windows 7 or 8" link_type="Ethernet or modem" distance=12 total_conn=4 shared_ip=N
    [karma] neighbors: -88
    [core] hook=lookup_rdns plugin=karma function=hook_lookup_rdns params="" retval=DENYDISCONNECT msg="Your mother was a hampster and your father smells of elderberries!"
    [core] disconnect ip=173.234.145.190 rdns="" helo="" relay=N early=N esmtp=N tls=N pipe=N txns=0 rcpts=0/0/0 msgs=0/0/0 bytes=0 lr="554 Your mother was a hampster and your father smells of elderberries!" time=10.009
    [core] data after disconnect from 173.234.145.190

As you can see, it's quite brief. There's rarely a good reason to stay on the
line with incorrigible senders.


KARMA BONUS
------------------------
Karma maintains a history for each IP. When a senders history has decreased
below -5 and they have never sent a good message, they get a karma bonus.
The bonus tacks on an extra day of blocking for every bad message they
send.

Example: an unknown sender delivers a spam. They get a one day penalty.
After 5 days, 5 spams, 5 penalties, and 0 good messages, they get a six day
penalty. The next offense gets a 7 day penalty, and so on.


USING KARMA
-----------------------
Unlike RBLs, *karma* only penalizes IPs that have sent us spam, and only when
those senders have sent us more spam than ham.


EFFECTIVENESS
---------------------
Effectiveness results from the propensity of bad senders to be repeat
offenders. Limiting them to a single offense per day(s) greatly reduces
the resources they can waste.

Of the connections that had previously passed all other checks and were caught
only by spamassassin and/or dspam, karma rejected 31 percent. Since
spamassassin and dspam consume far more resources than karma, this plugin
can be a very big win.


BUGS & LIMITATIONS
---------------------
This plugin is reactionary. Like the FBI, it doesn't do much until
after a crime has been committed.

There is little to be gained by listing servers that are already on DNS
blacklists, send to invalid users, earlytalkers, etc. Those already have
very lightweight tests.

