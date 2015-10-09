# Greylist

Basic greylisting plugin that follows common practices found on internets.

## Principles of work

### Notation

The so-called _tuple_ consists of the following:

* First subdomain of rDNS is stripped off (but no shorter than the domain boundary). This is considered a _hostid_.
* Envelope sender is the _sender_.
* RCPT TO would supply the _recipient_.

_hostid_ in above notation is chosen unless:

1. The connecting host has no PTR record, a.k.a. reverse DNS (rDNS). [gl]
1. The rDNS record contains the first two or last two octets of the IP address. [fcrdns]
1. The rDNS record contains the ‘short’, decimal, or hex representation of the full IP address. [fcrdns] [gl]
1. Multiple rDNS records are returned. [gl]
1. The rDNS record cannot be verified by forward confirmation (e.g. FCrDNS). [fcrdns]
1. The top-level-domain (TLD) used is not valid. [gl]

In other cases, it's set to be the remote party's IP address.

We define the following time periods:

* _black_:  between first connect and start of _gray_. Defer.
* _gray_:   between _black_ and start of _white_. Allow. Host must re-try within this window.
* _white_:  comes after _gray_. Allow up until the end of period, then let the record expire in case no connections were made.

### Algorithm

The greylist algo is as following:

  * Party connects. All FcrDNS & DNSWL checks are run by earlier plugins.
  * Party sends _recipient_
    * If not already whitelisted
        * Check _tuple_ color (compare current TS against record creation TS)
            * _black_?
                * Create if no record exists. Defer.
            * _gray_?
                * Allow. Promote record to _white_ status.
            * _white_?
                * Allow. Update record TS.
  * In special case, _data_ hook runs above algo for all recipients. If any matched, all inherit the action.

### DB schema

We store in Redis.

Key format for greylisting entries:

  * grey:${hostid}:${sender}:${recipient} - grey record
  * white:${hostid} - white record


For _white_:

    { first_connect: TS, whitelisted: TS, updated: TS, lifetime: TTL, tried: Integer, tried_when_greylisted: Integer }

  Where
    _first_connect_: TS of first connection (sender)
    _whitelisted_: basically the TS of this entry creation
    _updated_: last update TS
    _lifetime_: seconds for this entry to exist (== TTL)
    _tried_: number of checks against this entry
    _tried_when_greylisted_: number of checks while the host was +grey+ (sender).

For _grey_:

    { created: TS, updated: TS, lifetime: TTL, tried: Integer }

  Where
    _created_: TS of first connection (copied to _first_connect_ of _white_ after promotion)
    _updated_: last update TS
    _lifetime_: seconds for this entry to exist (== TTL)
    _tried_: number of checks against this entry (copied to _tried_when_greylisted_ of _white_ after promotion)

### Whitelisting

It's possible to whitelist hosts using the following section in greylist.ini config file:

  * ip\_whitelist               IP or subnet (prefix notation)
  * envelope\_whitelist         MAIL FROM (email or domain)
  * recipient\_whitelist        RCPT TO  (email or domain)

List of known dynamic hosts, to use the IP instead of the domain:

  * special\_dynamic\_domains    Domain
