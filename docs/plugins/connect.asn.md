# connect.asn

Inserts a result object with the ASN of the connecting IP address. The ASN is
the [Autonomous System Number](http://en.wikipedia.org/wiki/Autonomous_System_(Internet))
that represents the bailiwick or sphere of control of a network operator. 


# Usage

You can also access the ASN number for other plugins that run after this plugin like so:

    var asn = connection.results.get('connect.asn');
    if (asn && asn.asn) {
        connection.loginfo(plugin, "hey look, it's ASN: " + asn.asn);
    }

# Headers

Optionally add headers to messages with ASN info. See config/connect.asn.ini.

* add\_header - add X-Haraka-ASN header with the ASN and if available, netmask.
* provider\_header - add X-Haraka-ASN-[provider] headers with lookup results


# Theory

An ASN is a very good approximation of the IP space under the control
of a network operator. The theory behind ASN tracking is that good network
operators police their networks, proactively limit abuse, and are less likely
to be emitting abuse.

Not-so-good network operators are likely to emit a greater number of abusive
connections, and should be handled with increased scrutiny.


# Research

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


# Consumers

The [karma](/manual/plugins/karma.html) plugin uses the ASN to maintain
its network neighborhood reputation.


# TODO

Keep an eye on node-geoip. If/when it adds support for ASN lookups, note
that as an alternative data source.
