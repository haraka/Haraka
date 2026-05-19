# queue/smtp_proxy

================

This plugin delivers to another mail server. This is a common setup when you want to have a mail server with a solid pedigree of outbound delivery to other hosts, and inbound delivery to users.

In comparison to `queue/smtp_forward`, this plugin makes a connection at MAIL FROM time to the ongoing SMTP server. This can be a benefit in that you get any SMTP-time filtering that the ongoing server provides, in particular one important facility to some setups is recipient filtering.

Be aware that other than connect and HELO-time filtering, you will have as many connections to your ongoing SMTP server as you have to Haraka.

## Configuration

---

Configuration is stored in smtp_proxy.ini in the following keys:

- enable_outbound=[true]

  SMTP proxy outbound messages (set to false to enable Haraka's
  separate Outbound mail routing (MX based delivery)).

- host=HOST

  The host to connect to.

- port=PORT

  The port to connect to.

- connect_timeout=SECONDS

  The maximum amount of time to wait when creating a new connection
  to the host. Default if unspecified is 30 seconds.

- timeout=SECONDS

  The amount of seconds to let a backend connection live idle in the
  proxy pool. This should always be less than the global plugin timeout,
  which should in turn be less than the connection timeout.

- max_connections=NUMBER

  Maximum number of connections to create at any given time.

- enable_tls=[true|yes|1]

  Enable opportunistic TLS with the forward host via `STARTTLS` (if the host advertises it).

- auth_type=[plain|login]

  Enable PLAIN or LOGIN SMTP AUTH. This is required to enable AUTH.

- auth_user=USERNAME

  SMTP AUTH username to use.

- auth_pass=PASSWORD

  SMTP AUTH password to use.

- [tls]

Client STARTTLS options are assembled by merging:

1. `tls.ini` `[main]` — the global Haraka TLS config.
2. `smtp_proxy.ini` `[tls]` — overrides. Anything set here wins.

Changes to `tls.ini` require a Haraka restart to apply to the proxy path; changes to `smtp_proxy.ini` are picked up by the existing reload hook.
