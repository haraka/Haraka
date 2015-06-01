# karma - a scoring engine

Karma is a heuristic scoring engine that uses connection metadata and other Haraka plugins as inputs. Connections scoring in excess of specified thresholds are [penalized](#penalties) in proportionate ways.

## Description

Haraka includes some excellent plugins that detect message or sender patterns that are indicative of spam. [Some](sa-url) [plugins](snf-url) [have](fcrdns-url) [accuracy](uribl-url) rates above 95%. The extent that such plugins can be utilized depends on a sites tolerance for blocking legit messages. Sites that can't tolerate blocking ham are challenged to benefit from imperfect plugins.

Karma heuristically scores results from every plugin. By scoring a few "95+" plugins, accuracy rates above 99% are attainable. With a half dozen such plugins, 99.99% accuracy is attainable. With karma, good senders with good history can occasionally fail tests (false positives) and still deliver their mail. Senders with poor history have a harder time.

## How Karma Works

Karma takes a holistic view of **connections**, expecting other plugins to tolerate failures (deny/reject=false) and store processing [results](results-url). During the connection, karma progressively collects these results and applies the [awards](#awards) defined in `karma.ini`.

The scoring mechanism is not dissimilar to [SpamAssassin](sa-url), but Karma has some particular advantages:

    * Runs entirely in Node, so it's very fast
    * Async and very scalable.
    * Builds sender and network reputation databases
    * Has access to connection properties (relaying, port, auth attempts, etc..)
    * Access to raw SMTP commands (data + formatting inspection)
    * Can reject connections before DATA (save lots of bandwidth)

Karma is not a replacement for content filters. Karma focuses on the quality of the **connection**. Content filters (bayes\*) focus on the contents of the **message**. Karma works best *with* content filters.


# CONFIG

See config/karma.ini for options and inline documentation.


## <a name="awards"></a>AWARDS

Karma allows the site administrator to control how much weight to assign to
plugin results, providing a great deal of control over what results are
worth rejecting for.

Karma begins scoring the connection when the first packet arrives. The IP reputation, [sender OS](p0f-url), [GeoIP location](geoip-url), [DNSBL](dnsbl-url) listing, and [FCrDNS](fcrdns-url) are often a sufficient basis for rejecting a connection without ever blocking a ham.

Karma performs checks early and often, maximizing the penality it can exact upon bad mailers.


## <a name="penalties"></a>Penalties

### Deny / Reject

When connections become worse than [thresholds]negative, they are denied during the next [deny]hook.

### History

Karma history is computed as the number of good - bad connections.

When each connection ends, *karma* records the result. When a sufficient history has been built for an IP or ASN, future connections from that address(es) will get a positive or negative karma award.

The reward is purposefully small, to permit good senders in bad neighborhoods the ability to send.

### <a name="delay"></a>Connection Delays

Connection delays (aka tarpitting, teergrubing, early talker) slow down a SMTP conversation by inserting artificial delays. Early talking is when a sender talks out of turn. Karma punishes early talkers and increases connection delays adaptively as connection quality changes.

Karma's delay goals:

    1. Don't delay valid senders
    2. Penalize senders in proportion to their karma score
    3. Dampen bruteforce AUTH attacks.
    4. Since the only *cost* we can exact from miscreants is time, and connections are cheap to maintain, keep miscreants online as long as possible.

There are three tarpit options:

    [tarpit]
    * delay=0   (seconds to delay,      default: 0)
    * max=5     (max seconds to delay,  default: 5)

When set to zero, the value of the delay is adaptive, calculated proportional
to the karma score of the connection. Connections with good karma will see no
delay and bad ones will see long delays.

When delay is non-zero, each SMTP response will be delayed by that many seconds.

In practice, most naughty senders abandon the connection when forced to
wait more than a handful of seconds. `max` sets the maximum delay between
responses.

When using `karma`, do not use Haraka's `tarpit` or `early_talker` plugins.

## Included Tests

Connection data that karma considers:

* [IP Reputation](#IP_Reputation)
* [Neighbor reputation](#Neighbor_Reputation) (the network ASN)
* DENY events by other plugins
* envelope sender from a spammy TLD
* [malformed envelope addresses](#malformed_env)
* [unrecognized SMTP commands](#unrecognized)
* matching *env from* and *env to* name (rare in ham, frequent in spam)

The data from these tests are helpful but the real power of karma is [scoring
the results](#awards) of other plugins. See karma.ini for a rich set of examples.


### <a name="IP_Reputation"></a>IP Reputation

Karma records the number of good, bad, and total connections.  The results
are accessible so that other plugins as well.

    var karma = connection.results.get('karma');

The karma result object contains at least the following:

    connect: 0,       <- score for this connection
    history: 0,       <- score for all connections
    total_connects: 0,
    pass: [],         <- tests that added positive karma
    fail: [],         <- tests that added negative karma


### <a name="Neighbor_Reputation"></a>Neighborhood Reputation (ASN)

    [asn]
    enable=true    (default: true)
    award=2        (default: 1 point)

When [asn]enable is true, karma records the number of good and bad
connections from each ASN. If [asn]award is > 0, that many karma points
(plus or minus) are applied to future connections from that ASN.

ASNs with less than 5 karma points in either direction are ignored.


### <a name="malformed_env"></a>Malformed Envelope Addresses

Very old versions of Outlook Express and some malware senders don't bother complying with the RFC (5321, 2821, 821) address format. Karma checks the envelope from and to addresses for a common RFC ignorant pattern that is highly correlated with malware.


### <a name="unrecognized"></a>Unrecognized SMTP verbs/commands

Certain bruteforce password hacking tools have a pre-programmed SMTP path
that ignores SMTP responses. After EHLO, they attempt AUTH,LOGIN with a valid
username. To bruteforce a password often requires millions of attempts so each
bot sprays a couple dozen connections at the target server. Better quality
MTAs like Haraka have built-in auth protection that inserts timeouts
between successive auth attempts. The bots work around that by dropping the
connection after each failure and reconnecting. The attempts are distributed
so IP blocking is of limited effectiveness.

To combat these bruteforce attacks several strategies are called for:

    1. Impose [connection delays](#delay)
    2. Disable SMTP-AUTH when not encrypted. The bots rarely use STARTTLS.
       Besides preventing user passwords from transiting the internet in clear
       text, requiring TLS encryption also means AUTH is not available to
       poorly written bots.
    3. Having done #2, bot AUTH attempts show up as unrecognized commands.
       Penalizing these with tarpitting and rate limiting will almost never
       harm a legit sender but it will make it take much much longer for
       attackers to bruteforce passwords.


## LIMITATIONS

Karma is most effective at filtering mail delivered by bots and rogue servers.
Spam delivered by servers with good reputations flies past most of karma's
checks. Expect to use karma *with* content filters.


[p0f-url]: /manual/plugins/connect.p0f.html
[geoip-url]: /manual/plugins/connect.geoip.html
[dnsbl-url]: /manual/plugins/dnsbl.html
[fcrdns-url]: http://haraka.github.io/manual/plugins/connect.fcrdns.html
[uribl-url]: http://haraka.github.io/manual/plugins/data.uribl.html
[sa-url]: http://haraka.github.io/manual/plugins/spamassassin.html
[snf-url]: http://haraka.github.io/manual/plugins/messagesniffer.html
[results-url]: http://haraka.github.io/manual/Results.html
