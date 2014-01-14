
karma - reward nice and penalize naughty mail senders
===========================

Karma tracks sender history, allowing varying QoS
to naughty, nice, and unknown senders.

DESCRIPTION
-----------------------
Karma records the number of nice, naughty, and total connections from mail
senders. After sending a naughty message, if a sender has more naughty than
nice connections, they are penalized for *penalty_days*. Connections
from senders in the penalty box are rejected.

Karma stores two connection notes that other plugins can use to be more
lenient or strict.

    connection.notes.karma     - karma score on *this* connection
    connection.notes.karma_history  - karma history

Karma history is computed as the number of nice - naughty connections.

Karma is small, fast, and ruthlessly efficient. Karma can be used to craft
custom connection policies such as these two examples:

1. Hi well known and well behaved sender. Help yourself to greater
   concurrency (hosts_allow), multiple recipients (karma), and no
   delays (early_sender).

2. Hi there, naughty sender. You get a max concurrency of 1, max recipients
   of 2, and SMTP delays.


CONFIG
====================

negative <integer>
--------------------
How negative a senders karma can get before we penalize them.

Default: 2

Examples:

   negative 1:  0 nice - 1 naughty = karma -1, penalize
   negative 1:  1 nice - 1 naughty = karma  0, okay
   negative 2:  1 nice - 2 naughty = karma -1, okay
   negative 2:  1 nice - 3 naughty = karma -2, penalize

With the default negative limit of one, there's a very small chance you could
penalize a "mostly good" sender. Raising it to 2 reduces that possibility to
improbable.

penalty_days <days>
--------------------

The number of days a naughty sender is refused connections. Use a decimal
value to penalize for portions of days.

  karma penalty_days 1

Default: 1

reject [ 0 | 1 ]
-------------------
0 will not reject any connections.
1 will reject naughty senders.


db_dir <path>
--------------------
Path to a directory in which the DB will be stored. This directory must be
writable by the qpsmtpd user. If unset, the first usable directory from the
following list will be used:

    /var/lib/qpsmtpd/karma

    BINDIR/var/db (where BINDIR is the location of the qpsmtpd binary)

    BINDIR/config


BENEFITS
--------------------
Karma reduces the resources wasted by naughty mailers.

The biggest gains to be had are by having heavy plugins (spamassassin, dspam,
virus filters) set the _karma_ connection note (see KARMA) when they encounter
naughty senders. Reasons to send servers to the penalty box could include
sending a virus, early talking, or sending messages with a very high spam
score.

This plugin does not penalize connections with transaction notes I<relayclient>
or I<whitelisthost> set. These notes would have been set by the B<relay>,
B<whitelist>, and B<dns_whitelist_soft> plugins. Obviously, those plugins must
run before B<karma> for that to work.

KARMA
------------------------

It is mostly up to other plugins to reward well behaved senders with positive
karma and smite poorly behaved senders with negative karma. 
See B<USING KARMA IN OTHER PLUGINS>

After the connection ends, B<karma> will record the result. Mail servers whose
naughty connections exceed nice ones are sent to the penalty box. Servers in
the penalty box will be tersely disconnected for I<penalty_days>. Here is
an example connection from an IP in the penalty box:

 73122 Connection from smtp.midsetmediacorp.com [64.185.226.65]
 73122 (connect) ident::geoip: US, United States
 73122 (connect) ident::p0f: Windows 7 or 8
 73122 (connect) earlytalker: pass: 64.185.226.65 said nothing spontaneous
 73122 (connect) relay: skip: no match
 73122 (connect) karma: fail
 73122 550 You were naughty. You are cannot connect for 0.99 more days.
 73122 click, disconnecting
 73122 (post-connection) connection_time: 1.048 s.

If we only set negative karma, we will almost certainly penalize servers we
want to receive mail from. For example, a Yahoo user sends an egregious spam
to a user on our server. Now nobody on our server can receive email from that
Yahoo server for I<penalty_days>. This should happen approximately 0% of
the time if we are careful to also set positive karma.

KARMA HISTORY
------------------------
Karma maintains a history for each IP. When a senders history has decreased
below -5 and they have never sent a good message, they get a karma bonus.
The bonus tacks on an extra day of blocking for every naughty message they
send.

Example: an unknown sender delivers a spam. They get a one day penalty_box.
After 5 days, 5 spams, 5 penalties, and 0 nice messages, they get a six day
penalty. The next offense gets a 7 day penalty, and so on.

USING KARMA
-----------------------
To get rid of naughty connections as fast as possible, run karma before other
connection plugins. Plugins that trigger DNS lookups or impose time delays
should run after B<karma>. In this example, karma runs before all but the
ident plugins.

 89011 Connection from Unknown [69.61.27.204]
 89011 (connect) ident::geoip: US, United States
 89011 (connect) ident::p0f: Linux 3.x
 89011 (connect) karma: fail, 1 naughty, 0 nice, 1 connects
 89011 550 You were naughty. You are penalized for 0.99 more days.
 89011 click, disconnecting
 89011 (post-connection) connection_time: 0.118 s.
 88798 cleaning up after 89011

Unlike RBLs, B<karma> only penalizes IPs that have sent us spam, and only when
those senders have sent us more spam than ham.

USING KARMA IN OTHER PLUGINS
------------------------------
This plugin sets the connection note I<karma_history>. Your plugin can
use the senders karma to be more gracious or rude to senders. The value of
I<karma_history> is the number of nice connections minus naughty
ones. The higher the number, the better you should treat the sender.

To alter a connections karma based on its behavior, do this:

  $self->adjust_karma( -1 );  # lower karma (naughty)
  $self->adjust_karma(  1 );  # raise karma (good)


EFFECTIVENESS
---------------------

In the first 24 hours, _karma_ rejected 8% of all connections. After one
week of running with I<penalty_days 1>, karma has rejected 15% of all
connections.

This plugins effectiveness results from the propensity of naughty senders
to be repeat offenders. Limiting them to a single offense per day(s) greatly
reduces the resources they can waste.

Of the connections that had previously passed all other checks and were caught
only by spamassassin and/or dspam, B<karma> rejected 31 percent. Since
spamassassin and dspam consume more resources than others plugins, this plugin
seems to be a very big win.

DATABASE
---------------------

Connection summaries are stored in a database. The DB value is a : delimited
list containing a penalty box start time (if the server is/was on timeout)
and the count of naughty, nice, and total connections. The database can be
listed and searched with the karma_tool script.


BUGS & LIMITATIONS
---------------------

This plugin is reactionary. Like the FBI, it doesn't do much until
after a crime has been committed.

There is little to be gained by listing servers that are already on DNS
blacklists, send to invalid users, earlytalkers, etc. Those already have
very lightweight tests.

* some type of ASN integration, for tracking karma of 'neighborhoods'

