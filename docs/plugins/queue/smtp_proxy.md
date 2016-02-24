queue/smtp\_proxy
================

This plugin delivers to another mail server. This is a common setup when you
want to have a mail server with a solid pedigree of outbound delivery to
other hosts, and inbound delivery to users.

In comparison to `queue/smtp_forward`, this plugin makes a connection at
MAIL FROM time to the ongoing SMTP server. This can be a benefit in that
you get any SMTP-time filtering that the ongoing server provides, in
particular one important facility to some setups is recipient filtering.
However be aware that other than connect and HELO-time filtering, you will
have as many connections to your ongoing SMTP server as you have to Haraka.

Configuration
-------------

* smtp\_proxy.ini
  
  Configuration is stored in this file in the following keys:

    * enable\_outbound=[true]

    SMTP proxy outbound messages (set to false to enable Haraka's
    separate Outbound mail routing (MX based delivery)).

  * host=HOST
    
    The host to connect to.
    
  * port=PORT
    
    The port to connect to.

  * connect\_timeout=SECONDS

    The maximum amount of time to wait when creating a new connection
    to the host.  Default if unspecified is 30 seconds.

  * timeout=SECONDS
    
    The amount of seconds to let a backend connection live idle in the
    proxy pool.  This should always be less than the global plugin timeout,
    which should in turn be less than the connection timeout.

  * max\_connections=NUMBER
    
    Maximum number of connections to create at any given time.

  * enable\_tls=[true|yes|1]
 
    Enable TLS with the forward host (if supported). TLS uses options from
    the tls plugin.

  * auth\_type=[plain|login]

    Enable PLAIN or LOGIN SMTP AUTH.  This is required to enable AUTH.

  * auth\_user=USERNAME

    SMTP AUTH username to use.

  * auth\_pass=PASSWORD

    SMTP AUTH password to use.

