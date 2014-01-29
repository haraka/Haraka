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
    
    The port to connect to.
 
  * connect\_timeout=SECONDS

    The maximum amount of time to wait when creating a new connection
    to the host.  Default if unspecified is 30 seconds.

  * timeout=SECONDS
    
    The amount of seconds to let a backend connection live idle in the
    connection pool.  This should always be less than the global plugin
    timeout, which should in turn be less than the connection timeout.

  * max\_connections=NUMBER
   
    Maximum number of connections to create at any given time.

  * enable\_tls=[true|yes|1]

    Enable TLS with the forward host (if supported)

