auth/auth\_proxy
===============

This plugin allows you to authenticate users by domain to remote SMTP servers
and proxy the result back to authenticate the client.

For this to work - the AUTH username *must* be in user@domain.com format
regardless as to whether the remote SMTP server requires it in this format.
The domain part of the username is used to look-up which SMTP servers should 
be used to authenticate users for that domain.
When sending the AUTH credentials to the remote server, this plugin will try
and send the full username e.g. user@domain.com first and if this fails it 
will then strip the @domain.com part and just send the unqualified username.

Due to the way this plugin works - it can only support PLAIN and LOGIN
authentication methods and for this reason it requires that STARTTLS be
used via the tls plugin before it will advertise AUTH capabilities by the
EHLO command.  When connecting to the remote SMTP systems it will always
attempt STARTTLS if it is offered, but it does *not* require it, so caution
should be exercised.

Configuration
-------------

Configuration is stored in `config/auth_proxy.ini` and uses the INI
style formatting. 

The configuration of this plugin is simple:

    [domains]
    domain.com = server1.domain.com:587 server2.domain.com

Where domain.com is the domain-part of the username equals a list of hosts
that should be consulted in host:port format.  The :port is optional and will
default to 25.  The list of hosts can be space, semi-colon or comma separated.

If more than host is specified, then subsequent hosts will only be tested if
there is some sort of error e.g. timeout, connection or protocol error.
