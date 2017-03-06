queue/smtp\_forward
==================

This plugin delivers to another mail server. This is a common setup when you
want to have a mail server with a solid pedigree of outbound delivery to
other hosts, and inbound delivery to users.

In comparison to `queue/smtp_proxy`, this plugin waits until queue time to
attempt the ongoing connection. This can be a benefit in reducing connections
to your inbound mail server when you have content filtering (such as
spamassassin) enabled. A possible downside is that it also delays recipient
validation that the ongoing mail server may provide until queue time.

Configuration
-------------

* smtp\_forward.ini

  Configuration is stored in this file in the following keys:

  * enable\_outbound=[true]

    SMTP forward outbound messages (set to false to enable Haraka's separate
    Outbound mail routing (MX based delivery)).

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

    Enable TLS with the forward host (if supported). TLS uses options
    from the tls plugin.

  * auth\_type=[plain|login]

    Enable PLAIN or LOGIN SMTP AUTH.  This is required to enable AUTH.

  * auth\_user=USERNAME

    SMTP AUTH username to use.

  * auth\_pass=PASSWORD

    SMTP AUTH password to use.

# Per-Domain Configuration

More specific forward routes for domains can be defined. More specific routes
are only honored for SMTP connections with a single recipient or SMTP
connections where every recipient host is identical.

    # default SMTP host
    host=1.2.3.4
    # auth_type=plain
    # auth_user=user
    # auth_user=pass

    [example1.com]
    host=1.2.3.5
    # auth_type=plain
    # auth_user=user
    # auth_pass=pass

    [example2.com]
    host=1.2.3.5

    [example3.com]
    host=1.2.3.6

## split-host forward routing

When an incoming email transaction has multiple recipients with differing forward routes,  recipients to subsequent forward routes are deferred. Example: an incoming email transaction has recipients user@example1.com, user@example2.com, and user@example3.com. The first two messages will be accepted (they share the same forward destination) and the latter one will be deferred. It will arrive in a future delivery attempt by the remote.
