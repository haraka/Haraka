
# geoip 

provide geographic information about mail senders.

# SYNOPSIS

Use MaxMind's GeoIP databases and the geoip-lite node module to report
geographic information about incoming connections.

# DESCRIPTION

This plugin stores results in connection.notes.geoip. The following
keys are typically available:

    range: [ 3479299040, 3479299071 ],
    country: 'US',
    region: 'CA',
    city: 'San Francisco',
    ll: [37.7484, -122.4156],
    distance: 1539    // in kilometers

Adds entries like this to your logs:

    [connect.geoip] US
    [connect.geoip] US, WA
    [connect.geoip] US, WA, Seattle
    [connect.geoip] US, WA, Seattle, 1319km

Calculating the distance requires the public IP of this mail server. This may
be the IP that Haraka is bound to, but if not you'll need to supply it.

# CONFIG

- distance

Perform the geodesic distance calculations. Calculates the distance "as the
crow flies" from the remote mail server.

- public_ip: <IP Address>

The IP address to calculate the distance from. This will typically be
the public IP of your mail server.


# LIMITATIONS

The distance calculations are more concerned with being fast than
accurate.  The MaxMind location data is collected from whois and is of
limited accuracy.  MaxMind offers more accurate data for a fee.

For distance calculations, the earth is considered a perfect sphere. In
reality, it is not. Accuracy should be within 1%.

This plugin does not update the GeoIP databases. You may want to.


# SEE ALSO

MaxMind: http://www.maxmind.com/

Databases: http://geolite.maxmind.com/download/geoip/database
