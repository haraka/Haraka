
karma
===========================
A heuristic scoring engine that uses connection metadata and the results
of other Haraka plugins as inputs. Mail scoring above defined thresholds
are penalized in certain ways.


SYNOPSIS
---------------------------
A strength of Haraka is including a great number of plugins that detect
message or sender behavior that indicates spam. A weakness of most of those
plugins is that when enabled, legitimate mail is often blocked.

Karma takes a more holistic view of the connection, allowing senders to fail
some tests and still get their mail delivered. Fail too many tests though and
goodbye! Some connection data that karma considers:

* IP reputation (stored in Redis)
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


IP REPUTATION
-----------------------
Karma records the number of good, bad, and total connections. When a sender
has more bad than good connections, they can be penalized for *penalty\_days*.
Connections from senders in the penalty box are rejected until the penalty
expires.

Karma stores results that other plugins can use.

    var karma = connection.results.get('karma');

The karma results contains at least the following:

    connect: 0,        <- score for this connection
    history: 0,        <- score for all connections
    awards: [],        <- tests that added positive karma
    penalties: [],     <- tests that added negative karma


HISTORY
-----------------------
Karma history is computed as the number of good - bad connections.


CONFIG
====================

See config/karma.ini. It has lots of options and inline documentation.


BENEFITS
--------------------
Karma allows the site administrator to control how much weight to assign to
the plugin results, providing a great deal of control over what results are
worth rejecting for.

Karma begins scoring the connection when the first packet arrives. The IP
reputation, sender OS, GeoIP location, presence on a DNSBL, and FCrDNS are
often a sufficient basis for rejecting a connection without ever nabbing a
false positive.

Karma performs all these checks early and often, greatly reducing the time
spent "on the hook" with bad mailers.


KARMA
------------------------
When the connection ends, *karma* records the result. Mail servers whose
bad connections exceed good ones are sent to the penalty box. Servers in
the penalty box are tersely disconnected for *penalty\_days*. Here is
an example connection from an IP in the penalty box:

If only negative karma is set, desirable mailers will be penalized. For
example, a Yahoo user sends an egregious spam to a user on our server.
Now nobody on our server can receive email from that Yahoo server for
*penalty\_days*. This will happen approximately 0% of the time if we also
set positive karma.


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

