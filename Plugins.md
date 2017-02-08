# Haraka Plugins

To create your own plugin, see:
- the [plugin template][template] that includes all the boilerplate
- the [Write a Plugin][write-plugin] tutorial
- the [Plugins](plugins-doc) section of [the manual](https://haraka.github.io)

## Plugin Registry

A mostly comprehensive list of plugins known to be working and maintained.
Create a PR adding yours to this list.

| Plugin                     | Description |
| -------------------------  | ------------- |
| [access][url-access]       | ACLs based on IPs, domains, email addrs, etc. |
| [aliases][url-aliases]     |   |
| [attachment][url-attach]   |   |
| auth/[flat_file][url-authflat] | |
| auth/[auth_bridge][url-authbridge] |  |
| auth/[auth_ldap][url-authldap] |  |
| auth/[auth_proxy][url-authproxy] |  |
| auth/[auth_vpopmaild][url-authvpop] |  |
| [avg][url-avg]             |   |
| [backscatterer][url-scatter] |  |
| [block_me][url-blockme]    |   |
| [bounce][url-bounce]       |   |
| [clamd][url-clamd]         |   |
| [fcrdns][url-fcrdns]       |   |
| [connect.p0f][url-p0f]        |   |
| [data.headers][url-headers]  |  |
| [data.signatures][url-sigs]  |  |
| [data.uribl][url-uribl]  |  |
| [dcc][url-dcc]  |  |
| [delay_deny][url-delay]  |  |
| [dkim_sign][url-sign]  |  |
| [dkim_verify][url-dkimv]  |  |
| [dnsbl][url-dnsbl]  |  |
| [dnswl][url-dnswl]  |  |
| [early_talker][url-early]  |  |
| [esets][url-esets]  |  |
| [graph][url-graph]  |  |
| [greylist][url-greylist]  |  |
| [helo.checks][url-helo]  |  |
| [log.elasticsearch][url-elastic] |  |
| [syslog][url-syslog]
| [mail_from.is_resolvable][url-mfres]
| [messagesniffer][url-msgsniff]
| [prevent_credential_leaks][url-creds]
| [process_title][url-proctitle]
| profile
| queue/[discard][url-qdisc]  |   |
| queue/[lmtp][url-qlmtp]  |   |
| queue/[qmail-queue][url-qmail]  |   |
| queue/[quarantine][url-qquart]  |   |
| queue/[rabbitmq][url-qrabbit]  |   |
| queue/[rabbitmq_amqplib][url-qrabbita]  |   |
| queue/[smtp_bridge][url-qbridge]  |   |
| queue/[smtp_forward][url-qforward]  |   |
| queue/[smtp_proxy][url-qproxy]  |   |
| [rcpt_to.in_host_list][url-rhost]  |   |
| [rcpt_to.ldap][url-ldap]  |   |
| [rcpt_to.qmail_deliverable][url-rqmd]  |   |
| [rcpt_to.routes][url-rroutes]  |   |
| [record_envelope_addresses][url-recordenv]  |   |
| [relay][url-relay]  |   |
| [reseed_rng][url-rng]  |   |
| [rspamd][url-rspamd]  |   |
| [spamassassin][url-spamass]  |   |
| [spf][url-spf]  |   |
| [tarpit][url-tarpit]  |   |
| [tls][url-tls]  |   |
| [toobusy][url-toobusy]  |   |
| [xclient][url-xclient]  |   |



<!-- URLs tucked safely out of the way -->

[template]: https://github.com/haraka/haraka-plugin-template
[write-plugin]: https://github.com/haraka/Haraka/wiki/Write-a-Plugin
[plugins-doc]: http://haraka.github.io/manual/Plugins.html
[url-access]: https://github.com/haraka/Haraka/blob/master/docs/plugins/access.md
[url-aliases]: https://github.com/haraka/Haraka/blob/master/docs/plugins/aliases.md
[url-attach]: https://github.com/haraka/Haraka/blob/master/docs/plugins/attachment.md
[url-authflat]: https://github.com/haraka/Haraka/blob/master/docs/plugins/auth/flat_file.md
[url-authbridge]: https://github.com/haraka/Haraka/blob/master/docs/plugins/auth/auth_bridge.md
[url-authldap]: https://github.com/haraka/Haraka/blob/master/docs/plugins/auth/auth_ldap.md
[url-authproxy]: https://github.com/haraka/Haraka/blob/master/docs/plugins/auth/auth_proxy.md
[url-authvpop]: https://github.com/haraka/Haraka/blob/master/docs/plugins/auth/auth_vpopmaild.md
[url-avg]: https://github.com/haraka/Haraka/blob/master/docs/plugins/avg.md
[url-scatter]: https://github.com/haraka/Haraka/blob/master/docs/plugins/backscatterer.md
[url-blockme]: https://github.com/haraka/Haraka/blob/master/docs/plugins/block_me.md
[url-bounce]: https://github.com/haraka/Haraka/blob/master/docs/plugins/bounce.md
[url-clamd]: https://github.com/haraka/Haraka/blob/master/docs/plugins/clamd.md
[url-fcrdns]: https://github.com/haraka/haraka-plugin-fcrdns
[url-p0f]: https://github.com/haraka/Haraka/blob/master/docs/plugins/connect.p0f.md
[url-headers]: https://github.com/haraka/Haraka/blob/master/docs/plugins/data.headers.md
[url-sigs]: https://github.com/haraka/Haraka/blob/master/docs/plugins/data.signatures.md
[url-uribl]: https://github.com/haraka/Haraka/blob/master/docs/plugins/data.uribl.md
[url-dcc]: https://github.com/haraka/Haraka/blob/master/docs/plugins/dcc.md
[url-delay]: https://github.com/haraka/Haraka/blob/master/docs/plugins/delay_deny.md
[url-sign]: https://github.com/haraka/Haraka/blob/master/docs/plugins/dkim_sign.md
[url-dkimv]: https://github.com/haraka/Haraka/blob/master/docs/pluginsdkim_verify.md)
[url-dnsbl]: https://github.com/haraka/Haraka/blob/master/docs/plugins/dnsbl.md
[url-dnswl]: https://github.com/haraka/Haraka/blob/master/docs/plugins/dnswl.md
[url-early]: https://github.com/haraka/Haraka/blob/master/docs/plugins/early_talker.md
[url-esets]: https://github.com/haraka/Haraka/blob/master/docs/plugins/esets.md
[url-graph]: https://github.com/haraka/haraka-plugin-graph
[url-greylist]: https://github.com/haraka/Haraka/blob/master/docs/plugins/greylist.md
[url-helo]: https://github.com/haraka/Haraka/blob/master/docs/plugins/helo.checks.md
[url-elastic]: https://github.com/haraka/Haraka/blob/master/docs/plugins/log.elasticsearch.md
[url-syslog]: https://github.com/haraka/haraka-plugin-syslog)
[url-mfres]: https://github.com/haraka/Haraka/blob/master/docs/plugins/mail_from.is_resolvable.md)
[url-msgsniff]: https://github.com/haraka/Haraka/blob/master/docs/plugins/messagesniffer.md)
[url-creds]: https://github.com/haraka/Haraka/blob/master/docs/plugins/prevent_credential_leaks.md)
[url-proctitle]: https://github.com/haraka/Haraka/blob/master/docs/plugins/process_title.md)
[url-qdisc]: https://github.com/haraka/Haraka/blob/master/docs/plugins/queue/discard.md
[url-qlmtp]: https://github.com/haraka/Haraka/blob/master/docs/plugins/queue/lmtp.md
[url-qmail]: https://github.com/haraka/Haraka/blob/master/docs/plugins/queue/qmail-queue.md
[url-qquart]: https://github.com/haraka/Haraka/blob/master/docs/plugins/queue/quarantine.md
[url-qrabbit]: https://github.com/haraka/Haraka/blob/master/docs/plugins/queue/rabbitmq.md
[url-qrabbita]: https://github.com/haraka/Haraka/blob/master/docs/plugins/queue/rabbitmq_amqplib.md
[url-qbridge]: https://github.com/haraka/Haraka/blob/master/docs/plugins/queue/smtp_bridge.md
[url-qforward]: https://github.com/haraka/Haraka/blob/master/docs/plugins/queue/smtp_forward.md
[url-qproxy]: https://github.com/haraka/Haraka/blob/master/docs/plugins/queue/smtp_proxy.md
[url-rhost]: https://github.com/haraka/Haraka/blob/master/docs/plugins/rcpt_to.in_host_list.md
[url-ldap]: https://github.com/haraka/Haraka/blob/master/docs/plugins/rcpt_to.ldap.md
[url-rqmd]: https://github.com/haraka/Haraka/blob/master/docs/plugins/rcpt_to.qmail_deliverable.md
[url-rroutes]: https://github.com/haraka/Haraka/blob/master/docs/plugins/rcpt_to.routes.md
[url-recordenv]: https://github.com/haraka/Haraka/blob/master/docs/plugins/record_envelope_addresses.md
[url-relay]: https://github.com/haraka/Haraka/blob/master/docs/plugins/relay.md
[url-rng]: https://github.com/haraka/Haraka/blob/master/docs/plugins/reseed_rng.md
[url-rspamd]: https://github.com/haraka/Haraka/blob/master/docs/plugins/rspamd.md
[url-spamass]: https://github.com/haraka/Haraka/blob/master/docs/plugins/spamassassin.md
[url-spf]: https://github.com/haraka/Haraka/blob/master/docs/plugins/spf.md
[url-tarpit]: https://github.com/haraka/Haraka/blob/master/docs/plugins/tarpit.md
[url-tls]: https://github.com/haraka/Haraka/blob/master/docs/plugins/tls.md
[url-toobusy]: https://github.com/haraka/Haraka/blob/master/docs/plugins/toobusy.md
[url-xclient]: https://github.com/haraka/Haraka/blob/master/docs/plugins/xclient.md