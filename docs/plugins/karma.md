
karma - reward good and penalize bad mail senders
===========================
Karma tracks sender history and varyies QoS for based on the senders reputation.


SYNOPSIS
---------------------------
Karma can be used to craft custom connection policies such as these examples:

1. Hi well known and well behaved sender. Help yourself to greater concurrency,
   more recipients, and no delays.

2. Hi there, bad sender. You get a max concurrency of 1, max recipients
   of 2, and SMTP delays.


DESCRIPTION
-----------------------
Karma records the number of good, bad, and total connections. When a sender
has more bad than good connections, they are penalized for *penalty_days*.
Connections from senders in the penalty box are rejected until the penalty
expires.

Karma stores a connection note (*connection.notes.karma*) that other
plugins can use. It contains the following;

    connection: 0,     <- score for this connection
    history: 0,        <- score for all connections
    awards: [],        <- tests that added positive karma
    penalties: [ ],    <- tests that added negative karma


HISTORY
-----------------------
Karma history is computed as the number of good - bad connections.


CONFIG
====================

See config/karma.ini. It has lots of options and inline documentation.


BENEFITS
--------------------
Karma reduces the resources wasted by bad mailers.

The biggest gains to be had are by assigning lots of negative karma by the
heavy plugins (spamassassin, dspam, virus filters) when they encounter spam.
Karma will notice and reward them appropriately in the future.


KARMA
------------------------
When the connection ends, B<karma> records the result. Mail servers whose
bad connections exceed good ones are sent to the penalty box. Servers in
the penalty box are tersely disconnected for *penalty_days*. Here is
an example connection from an IP in the penalty box:

If only negative karma is set, desirable mailers will be penalized. For
example, a Yahoo user sends an egregious spam to a user on our server.
Now nobody on our server can receive email from that Yahoo server for
*penalty_days*. This will happen approximately 0% of the time if we also
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


TODO
-----------------------
* ASN integration, for tracking the karma of 'neighborhoods'

