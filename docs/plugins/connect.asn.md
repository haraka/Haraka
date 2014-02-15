# connect.asn

Inserts a result object with the ASN of the connecting IP address. The ASN is
the [Autonomous System Number](http://en.wikipedia.org/wiki/Autonomous_System_(Internet))
that represents the bailiwick or sphere of control of a network operator. 


# Usage

    var asn = connection.results.get('connect.asn');
    if (asn && asn.asn) {
        connection.loginfo(plugin, "hey look, it's ASN: " + asn.asn);
    }


# Theory

An ASN is a very good approximation of all of the IP space under the control
of a network operator. The theory behind ASN tracking is that good network
operators police their networks, proactively limit abuse, and are less likely
to be emitting abusive connections.

Not-so-good network operators are likely to emit a greater number of abusive
connections, and should be handled with increased scrutiny.


# Consumers

The [karma](/manual/plugins/karma.html) plugin uses the ASN lookup to maintain
its network neighborhood reputation. 
