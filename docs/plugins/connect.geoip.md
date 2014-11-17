
# geoip

provide geographic information about mail senders.

# SYNOPSIS

Use MaxMind's GeoIP databases to report geographic information about senders. This plugin has support for both the [maxmind](https://github.com/runk/node-maxmind) and [geoip-lite](https://github.com/bluesmoon/node-geoip) node modules.

# INSTALL

Install the npm geoip module you prefer:

    npm install maxmind
      or
    npm install -g geoip-lite

If both are installed, maxmind will be preferred as it's faster and also provides ASN data. The maxmind module requires manual download of the GeoIP databases. A MaxMind-provided script in `contrib/geolite-mirror-simple.pl` has instructions for installion as a cron job:

```bash
mkdir -p /usr/local/share/GeoIP/download
perl contrib/geolite-mirror-simple.pl
```

# DESCRIPTION

GeoIP results are stored in connection.notes.geoip and connection.[results](https://github.com/baudehlo/Haraka/blob/master/docs/Results.md).connect.geoip. The following information is typically available:

    continent: NA,
    country:   US,

If the GeoIP city database is available, the following may also be available:

    region:   CA,
    city:     San Francisco,
    ll:       [37.7484, -122.4156],
    distance: 1539    // in kilometers
    range:    [ 3479299040, 3479299071 ],

`connect.geoip` also adds entries like this to your logs:

    [connect.geoip] US
    [connect.geoip] US, WA
    [connect.geoip] US, WA, Seattle
    [connect.geoip] US, WA, Seattle, 1319km

Calculating the distance requires the public IP of this mail server. This may
be the IP that Haraka is bound to. If not, make sure that `utils.get_public_ip`
can figure it out (via STUN or in `smtp.ini`).

# CONFIG

- distance

Perform the geodesic distance calculations. Calculates the distance "as the
crow flies" from the remote mail server.

This calculation requires a 'from' IP address. This will typically be the
public IP of your mail server. If Haraka is bound to a private IP, net\_utils
will attempt to determine your public IP. If that doesn't work, edit
config/smtp.ini and set `public_ip`.

- show\_city

show city data in logs and headers. City data is less accurate than country.

- show\_region in logs and headers. Regional data are US states, Canadian
  provinces and such.

Set a connection result to true if the distance exceeds this many kilometers.

- too\_far=4000


# SPAM PREDICTION WITH DISTANCE

[Spatio-temporal Network-level Automatic Reputation Engine](http://www.cc.gatech.edu/~feamster/papers/snare-usenix09.pdf)

    "For ham, 90% of the messages travel about 4,000 km or less. On the
    other hand, for spam, only 28% of messages stay within this range."

Observations in 2014 suggest that geodesic distance continues to be an
excellent predictor of spam.


# LIMITATIONS

The distance calculations are more concerned with being fast than
accurate. The MaxMind location data is collected from whois and is of
limited accuracy. MaxMind offers more accurate data for a fee.

For distance calculations, the earth is considered a perfect sphere. In
reality, it is not. Accuracy should be within 1%.

This plugin does not update the GeoIP databases. You may want to.


# SEE ALSO

MaxMind: http://www.maxmind.com/

Databases: http://geolite.maxmind.com/download/geoip/database


# TODO

Keep an eye on node-geoip and see if they add ASN support. This would be an
alternative to connect.asn which uses a DNS lookup to retrieve the ASN.
