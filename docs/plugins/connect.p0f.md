connect.p0f - A TCP Fingerprinting Plugin
========================

Use TCP fingerprint info (remote computer OS, network distance, etc) to
implement more sophisticated anti-spam policies.

This plugin inserts a _p0f_ connection note with information deduced
from the TCP fingerprint. The note typically includes at least the link,
detail, distance, uptime, genre. Here's an example:

 genre    => FreeBSD
 detail   => 8.x (1)
 uptime   => 1390
 link     => ethernet/modem
 distance => 17

Which was parsed from this p0f fingerprint:

  24.18.227.2:39435 - FreeBSD 8.x (1) (up: 1390 hrs)
    -> 208.75.177.101:25 (distance 17, link: ethernet/modem)

The following additional values may also be available in
the _p0f_ connection note:

    magic, status, first_seen, last_seen, total_conn, uptime_min, up_mod_days, last_nat, last_chg, distance, bad_sw, os_match_q, os_name, os_flavor, http_name, http_flavor, link_type, and language.


Configuration
-----------------

1. start p0f

Create a startup script for p0f that creates a communication socket when your
server starts up.

    /usr/local/bin/p0f -u smtpd -d -s /tmp/.p0f_socket 'dst port 25 or dst port 587'
    chown smtpd /tmp/.p0f_socket

2. configure p0f plugin

add an entry to config/plugins to enable p0f:

    connect.p0f


3. review settings in config/connect.p0f.ini


