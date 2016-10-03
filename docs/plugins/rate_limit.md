rate\_limit
==========

Enforce limits on connection concurrency, connection rate, and recipient rate.

By default DENYSOFT will be returned when the limits are exceeded, but for 
concurrency, connection rate and recipient rate by host you can optionally 
tarpit the connection by adding a delay before every response sent back to the 
client instead of sending a DENYSOFT.  To do this requires the 'tarpit' plugin 
to run immediately after this plugin.

To use this plugin you will need a Redis server and will need the redis, 
hiredis and ipaddr.js packages installed via:

    cd /path/to/haraka/home
    npm install redis hiredis ipaddr.js
    
Configuration
-------------

This plugin uses the configuration file rate\_limit.ini which is checked for 
updates before each hook, so changes to this file will never require a restart 
and will take effect seconds after the changes are saved.

The configuration options for each heading are detailed below:

### [main]

- redis\_server = \<ip | host\>[:port] *(optional)*

    If port is missing then it defaults to 6379.  
    If this setting is missing entirely then it defaults to 127.0.0.1:6379.
    
    Note that Redis does not currently support IPv6.

- tarpit\_delay = seconds *(optional)*

    Set this to the length in seconds that you want to delay every SMTP 
    response to a remote client that has exceeded the rate limits.  For this 
    to work the 'tarpit' plugin must be loaded **after** this plugin in 
    config/plugins. 

    If 'tarpit' is not loaded or is loaded before this plugin, then no
    rate throttling will occur.

* * *

All of the following sections are optional.  Any missing section disables 
that particular test.

They all use a common configuration format:

- \<lookup\> = \<limit\>[/time[unit]]  *(optional)*

   'lookup' is based upon the limit being enforced and is either an IP 
   address, rDNS name, sender address or recipient address either in full 
   or part.  
   The lookup order is as follows and the first match in this order is 
   returned and is used as the record key in Redis (except for 'default' 
   which always uses the full lookup for that test as the record key):
   
   **IPv4/IPv6 address or rDNS hostname:**

   <pre>
   fe80:0:0:0:202:b3ff:fe1e:8329
   fe80:0:0:0:202:b3ff:fe1e
   fe80:0:0:0:202:b3ff
   fe80:0:0:0:202
   fe80:0:0:0
   fe80:0:0
   fe80:0
   fe80
   1.2.3.4
   1.2.3
   1.2
   1
   host.part.domain.com
   part.domain.com
   domain.com
   com
   default
   </pre>

   **Sender or Recipient address:**
 
   <pre>
   user@host.sub.part.domain.com
   host.sub.part.domain.com
   sub.part.domain.com
   part.domain.com
   domain.com
   com
   default
   </pre>

   In all tests 'default' is used to specify a default limit if nothing else has 
   matched.
   
   'limit' specifies the limit for this lookup.  Specify 0 (zero) to disable 
   limits on a matching lookup.
   
   'time' is optional and if missing defaults to 60 seconds.  You can optionally 
   specify the following time units (case-insensitive):
   
   - s (seconds)
   - m (minutes)
   - h (hours)
   - d (days)

### [concurrency]

**IMPORTANT NOTE:** connection concurrency is recorded in-memory (in 
connection.server.notes) and not in Redis, so the limits are per-server and 
per-child if you use the cluster module.

IP and rDNS names are looked up by this test.  This section does *not* accept an 
interval.  It's a hard limit on the number of connections and not based on time.

### [rate\_conn]

This section limits the number of connections per interval from a given host 
or set of hosts.

IP and rDNS names are looked up by this test.

### [rate\_rcpt\_host]

This section limits the number of recipients per interval from a given host or 
set of hosts. 

IP and rDNS names are looked up by this test.

### [rate\_rcpt\_sender]

This section limits the number of recipients per interval from a sender or 
sender domain.

The sender is looked up by this test.

### [rate\_rcpt]

This section limits the rate which a recipient or recipient domain can 
receive messages over an interval.

Each recipient is looked up by this test.

### [rate\_rcpt\_null]

This section limits the rate at which a recipient can receive messages from 
a null sender (e.g. DSN, MDN etc.) over an interval.

Each recipient is looked up by this test.
