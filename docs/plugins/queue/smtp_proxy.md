queue/smtp_proxy
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

* smtp_proxy.ini
  
  Configuration is stored in this file in the following keys:
  
  * host=HOST
    
    The host to connect to.
    
  * port=PORT
    
    The port to connect to.

  * timeout=SECONDS
    
    The amount of seconds to let a backend connection live idle in the
    proxy pool.  This should always be less than the global plugin timeout,
    which should in turn be less than the connection timeout.

  Both values are required.
  
