# auth/auth_bridge

This plugin allows you to authenticate users to remote SMTP servers
bridging the original user and password to the remote server,
and proxy the result back to authenticate the client.

This plugin is meant to be used with the plugin `queue/smtp_bridge`.

It is different than `auth/auth_proxy` because it doesn't require
the AUTH user in user@domain.com format, and it doesn't check that
the domain is the configuration file. This plugins simply takes
the original user and password and tries to authenticate it in the
remote SMTP server.

## Configuration

Configuration is stored in `config/smtp_bridge.ini` and uses the INI
style formatting.

The configuration of this plugin is simple:

    host=localhost
    #port=
    #auth_type=
    #priority=10

- host: the host where you will be authenticating and posting,
  for example `smtp.host.tld`, `192.0.2.25:587`, or `[2001:db8::1]:587`.
  This is the only setting required. See [Endpoint][endpoint] for the
  accepted forms. An IPv6 address must be bracketed to include a port.

If needed you can also set

- port: used when `host` doesn't include one. Defaults to 25.

[endpoint]: https://github.com/haraka/haraka-net-utils#endpoint

The options `auth_type` and `priority` will be used by `queue/smtp_bridge`
