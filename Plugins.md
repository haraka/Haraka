# Haraka Plugins

To create your own plugin, see:
- the [plugin template][template] that includes all the boilerplate
- the [Write a Plugin][write-plugin] tutorial
- the [Plugins](plugins-doc) section of [the manual](https://haraka.github.io)

## Plugin Registry

A mostly comprehensive list of plugins known to be working and maintained.
Create a PR adding yours to this list.

| Plugin                  | Description |
| ----------------------  | ------------- |
| [access][url-access]    | ACLs based on IPs, domains, email addrs, etc. |
| [aliases][url-aliases]  |   |
| [attachment][url-attach] |  |
| auth/[flat_file][url-authflat] | |
| auth/[auth_bridge][url-authbridge] |  |
| auth/[auth_ldap][url-authldap] |  |
| auth/[auth_proxy][url-authproxy] |  |
| auth/[auth_vpopmaild][url-authvpop] |  |
| [avg](https://github.com/haraka/Haraka/blob/master/docs/plugins/avg.md)
| [backscatterer](https://github.com/haraka/Haraka/blob/master/docs/plugins/backscatterer.md)
| [block_me](https://github.com/haraka/Haraka/blob/master/docs/plugins/block_me.md)
| [bounce](https://github.com/haraka/Haraka/blob/master/docs/plugins/bounce.md)
| [clamd](https://github.com/haraka/Haraka/blob/master/docs/plugins/clamd.md)
| [connect.fcrdns](https://github.com/haraka/Haraka/blob/master/docs/plugins/connect.fcrdns.md)
| [connect.p0f](https://github.com/haraka/Haraka/blob/master/docs/plugins/connect.p0f.md)
| [data.headers](https://github.com/haraka/Haraka/blob/master/docs/plugins/data.headers.md)
| [data.signatures](https://github.com/haraka/Haraka/blob/master/docs/plugins/data.signatures.md)
| [data.uribl](https://github.com/haraka/Haraka/blob/master/docs/plugins/data.uribl.md)
| [dcc](https://github.com/haraka/Haraka/blob/master/docs/plugins/dcc.md)
| [delay_deny](https://github.com/haraka/Haraka/blob/master/docs/plugins/delay_deny.md)
| [dkim_sign](https://github.com/haraka/Haraka/blob/master/docs/plugins/dkim_sign.md)
| [dkim_verify](https://github.com/haraka/Haraka/blob/master/docs/plugins/dkim_verify.md)
| [dnsbl](https://github.com/haraka/Haraka/blob/master/docs/plugins/dnsbl.md)
| [dnswl](https://github.com/haraka/Haraka/blob/master/docs/plugins/dnswl.md)
| [early_talker](https://github.com/haraka/Haraka/blob/master/docs/plugins/early_talker.md)
| [esets](https://github.com/haraka/Haraka/blob/master/docs/plugins/esets.md)
| [graph](https://github.com/haraka/Haraka/blob/master/docs/plugins/graph.md)
| [greylist](https://github.com/haraka/Haraka/blob/master/docs/plugins/greylist.md)
| [helo.checks](https://github.com/haraka/Haraka/blob/master/docs/plugins/helo.checks.md)
| [log.elasticsearch](https://github.com/haraka/Haraka/blob/master/docs/plugins/log.elasticsearch.md)
| [syslog](https://github.com/haraka/haraka-plugin-syslog)
| [mail_from.is_resolvable](https://github.com/haraka/Haraka/blob/master/docs/plugins/mail_from.is_resolvable.md)
| [messagesniffer](https://github.com/haraka/Haraka/blob/master/docs/plugins/messagesniffer.md)
| [prevent_credential_leaks](https://github.com/haraka/Haraka/blob/master/docs/plugins/prevent_credential_leaks.md)
| [process_title](https://github.com/haraka/Haraka/blob/master/docs/plugins/process_title.md)
| profile
| queue
    - [discard](https://github.com/haraka/Haraka/blob/master/docs/plugins/queue/discard.md)
    - [lmtp](https://github.com/haraka/Haraka/blob/master/docs/plugins/queue/lmtp.md)
    - [qmail-queue](https://github.com/haraka/Haraka/blob/master/docs/plugins/queue/qmail-queue.md)
    - [quarantine](https://github.com/haraka/Haraka/blob/master/docs/plugins/queue/quarantine.md)
    - [rabbitmq](https://github.com/haraka/Haraka/blob/master/docs/plugins/queue/rabbitmq.md)
    - [rabbitmq_amqplib](https://github.com/haraka/Haraka/blob/master/docs/plugins/queue/rabbitmq_amqplib.md)
    - [smtp_bridge](https://github.com/haraka/Haraka/blob/master/docs/plugins/queue/smtp_bridge.md)
    - [smtp_forward](https://github.com/haraka/Haraka/blob/master/docs/plugins/queue/smtp_forward.md)
    - [smtp_proxy](https://github.com/haraka/Haraka/blob/master/docs/plugins/queue/smtp_proxy.md)
| [rcpt_to.in_host_list](https://github.com/haraka/Haraka/blob/master/docs/plugins/rcpt_to.in_host_list.md)
| [rcpt_to.ldap](https://github.com/haraka/Haraka/blob/master/docs/plugins/rcpt_to.ldap.md)
| [rcpt_to.qmail_deliverable](https://github.com/haraka/Haraka/blob/master/docs/plugins/rcpt_to.qmail_deliverable.md)
| [rcpt_to.routes](https://github.com/haraka/Haraka/blob/master/docs/plugins/rcpt_to.routes.md)
| [record_envelope_addresses](https://github.com/haraka/Haraka/blob/master/docs/plugins/record_envelope_addresses.md)
| [relay](https://github.com/haraka/Haraka/blob/master/docs/plugins/relay.md)
| [reseed_rng](https://github.com/haraka/Haraka/blob/master/docs/plugins/reseed_rng.md)
| [rspamd](https://github.com/haraka/Haraka/blob/master/docs/plugins/rspamd.md)
| [spamassassin](https://github.com/haraka/Haraka/blob/master/docs/plugins/spamassassin.md)
| [spf](https://github.com/haraka/Haraka/blob/master/docs/plugins/spf.md)
| [tarpit](https://github.com/haraka/Haraka/blob/master/docs/plugins/tarpit.md)
| [tls](https://github.com/haraka/Haraka/blob/master/docs/plugins/tls.md)
| [toobusy](https://github.com/haraka/Haraka/blob/master/docs/plugins/toobusy.md)
| [xclient](https://github.com/haraka/Haraka/blob/master/docs/plugins/xclient.md)



[template]: https://github.com/haraka/haraka-plugin-template
[write-plugin]: https://github.com/haraka/Haraka/wiki/Write-a-Plugin
[plugins-doc]: http://haraka.github.io/manual/Plugins.html
[url-access]: https://github.com/haraka/Haraka/blob/master/docs/plugins/access.md
[url-aliases]: https://github.com/haraka/Haraka/blob/master/docs/plugins/aliases.md
[url-attach]: https://github.com/haraka/Haraka/blob/master/docs/plugins/attachment.md
[url-authflat]: https://github.com/haraka/Haraka/blob/master/docs/plugins/auth/flat_file.md
[url-authbridge]: https://github.com/haraka/Haraka/blob/master/docs/plugins/auth/auth_bridge.md)
[url-authldap]: https://github.com/haraka/Haraka/blob/master/docs/plugins/auth/auth_ldap.md)
[url-authproxy]: https://github.com/haraka/Haraka/blob/master/docs/plugins/auth/auth_proxy.md)
[url-authvpop]: https://github.com/haraka/Haraka/blob/master/docs/plugins/auth/auth_vpopmaild.md)
