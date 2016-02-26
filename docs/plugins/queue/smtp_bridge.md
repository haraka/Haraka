queue/smtp\_bridge
===============

This plugin delivers to another SMTP server, bridging the authentication
details and post data from the initial connection.

This plugin is meant to be used with the plugin `auth/auth_bridge`.

It is different than `queue/smtp_proxy` or `queue/smpt_forward` because
it doesn't use the AUTH details from a configuration file. This plugins
simply post the data from the original connection to the remote SMTP server
using the original AUTH details.

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
* auth_type: default to empty and Haraka will try to pick an appropriate method.
* priority: default to 10.

