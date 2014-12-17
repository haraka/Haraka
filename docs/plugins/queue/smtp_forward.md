queue/smtp\_forward
==================

This plugin delivers to another mail server. This is a common setup when you
want to have a mail server with a solid pedigree of outbound delivery to
other hosts, and inbound delivery to users.

In comparison to `queue/smtp_proxy`, this plugin waits until queue time to
attempt the ongoing connection. This can be a benefit in reducing connections
to your inbound mail server when you have content filtering (such as
spamassassin) enabled. However you miss out on the benefits of recipient
filtering that the ongoing mail server may provide.

Configuration
-------------

* smtp\_forward.ini
  
  Configuration is stored in this file in the following keys:
  
  * host=HOST
    
    The host to connect to.
    
  * port=PORT
    
    The port to connect to. Default: 25
 
  * connect\_timeout=SECONDS

    The maximum amount of time to wait when creating a new connection
    to the host.  Default: 30 seconds.

  * timeout=SECONDS
    
    The amount of seconds to let a backend connection live idle in the
    connection pool.  This should always be less than the global plugin
    timeout, which should in turn be less than the connection timeout.

  * max\_connections=NUMBER
   
    Maximum number of connections at any given time. Default: 1000

  * enable\_tls=[true]

    Enable TLS with the forward host (if supported)

# Per-Domain Configuration

More specific forward routes for domains can be defined. More specific routes
are only honored for SMTP connections with a single recipient or SMTP
connections where every recipient is identical.

    # default SMTP host
    host=1.2.3.4

    [example1.com]
    host=1.2.3.5

    [example2.com]
    host=1.2.3.5

    [example3.com]
    host=1.2.3.6

Messages with a single recipient to example[1-3].com will get delivered
directly to the specified host. Messages with recipients only in the domains
example1.com and example2.com will get delivered directly to 1.2.3.5.
Everything else gets delivered to 1.2.3.4.

See [GitHub Issue #573](https://github.com/baudehlo/Haraka/issues/573) for
background on the limitations of smtp-forward with recipients in different
domains.
