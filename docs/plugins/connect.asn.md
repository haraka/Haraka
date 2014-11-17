# connect.asn

* Use network services to look up the ASN of the remote IP.
* Inserts a result object with the ASN of the connecting IP address.

The AS Nunber is the [Autonomous System Number](http://en.wikipedia.org/wiki/Autonomous_System_(Internet))
that represents the bailiwick or sphere of control of a network operator.

## alternate source

If your mail server is very busy, use instead the `connect.geoip`
plugin with the MaxMind backend. It caches a copy of the ASN database locally
and gets the ASN without the additional network traffic and delays.

## Usage

You can also access the ASN number for other plugins that run after this plugin like so:

    var asn = connection.results.get('connect.asn');
    if (asn && asn.asn) {
        connection.loginfo(plugin, "hey look, it's ASN: " + asn.asn);
    }


## Configuration

The following settings can be set in config/connect.asn.ini.

* providers: comma separated list of DNS zones that provide IP to ASN lookups

Supported providers: origin.asn.cymru.com, origin.asn.spameatingmonkey.net
and asn.routeviews.org

* test\_ip: (Default:

An IP address that maps to an ASN (any valid public IP should work)

* timeout (in seconds): (Default: 4)

How long to wait for DNS results to return.


## Headers

Optionally add headers to messages with ASN info.

* asn\_header (Default: false)

add X-Haraka-ASN header with the ASN and if available, netmask.

* provider\_header (Default: false)

Add X-Haraka-ASN-[provider] header for each provider that returned results.


## Theory

An ASN is a very good approximation of the IP space under the control
of a network operator. The theory behind ASN tracking is that good network
operators police their networks, proactively limit abuse, and are less likely
to be emitting abuse.

Not-so-good network operators are likely to emit a greater number of abusive
connections, and should be handled with increased scrutiny.


## Research

http://www.cc.gatech.edu/~feamster/papers/snare-usenix09.pdf

"Performance based on AS number only...The classifier gets a false positive
rate of 0.76% [and] a 70% detection rate"

"AS numbers are more persistently associated with a sender's
identity than the IP address, for two reasons: (1) The spamming mail server
might be set up within specific ASes without the network administrator
shutting it down. (2) Bots tend to aggregate within ASes, since the machines
in the same ASes are likely to have the same vulnerability. It is not easy for
spammers to move mail servers or the bot armies to a different AS; therefore,
AS numbers are robust to indicate malicious hosts."

See also: [Using BGP data to find spammers](http://www.bgpmon.net/using-bgp-data-to-find-spammers/)

## Consumers

The [karma](/manual/plugins/karma.html) plugin uses the ASN to maintain
its network neighborhood reputation.
