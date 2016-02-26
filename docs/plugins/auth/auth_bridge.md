auth/auth\_bridge
===============

This plugin allows you to authenticate users to remote SMTP servers
bridging the original user and password to the remote server,
and proxy the result back to authenticate the client.

This plugin is meant to be used with the plugin `queue/smtp_bridge`.

It is different than `auth/auth_proxy` because it doesn't require
the AUTH user in user@domain.com format, and it doesn't check that
the domain is the configuration file. This plugins simply takes
the original user and password and tries to authenticate it in the
remote SMTP server.

Configuration
-------------

Configuration is stored in `config/smtp_bridge.ini` and uses the INI
style formatting.

The configuration of this plugin is simple:

    host=localhost
    #port=
    #auth_type=
    #priority=10

* host: the host where you will be authenticating and posting,
for example `smtp.host.tld`. This is the only setting required.

If needed you can also set

* port: default to empty and Haraka will use 25.

The options `auth_type` and `priority` will be used by `queue/smtp_bridge`
