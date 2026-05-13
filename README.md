# Haraka — a Node.js Mail Server

![Tests](https://github.com/haraka/Haraka/actions/workflows/ci.yml/badge.svg)
[![Coverage Status][cov-img]][cov-url]

Haraka is a highly scalable [Node.js][1] SMTP server with a modular plugin
architecture. It handles thousands of concurrent connections and delivers
thousands of messages per second. Haraka and its plugins are written in
asynchronous JavaScript, optimised for throughput and low latency.

Haraka offers strong spam protection (see [Plugins.md][plugins]) and is widely
deployed as a filtering [MTA][3] or as a [MSA][5] on port 465 (and legacy 587) with the auth and [DKIM][6] plugins enabled.

Haraka is not a mail store, an [LDA][7], or an IMAP server. It is designed to
work **alongside** those systems. A scalable outbound delivery engine is built
in: mail flagged as `relaying` (for example, by an auth plugin) is queued for
outbound delivery automatically.

## Plugin Architecture

Haraka's defining feature is its plugin system. Every SMTP transaction is a
sequence of well-defined hooks — `connect`, `helo`, `mail`, `rcpt`, `data`,
`data_post`, `queue`, and more — and each hook can be extended with a few
lines of JavaScript. Plugins are asynchronous by default, so a slow lookup
against DNS, Redis, or an HTTP API never blocks the server.

The result is that behaviours which would require a custom MTA elsewhere
are typically a small file in Haraka. For example, accepting qmail-style
tagged addresses (`user-anything@domain.com`) and rewriting them to
`user@domain.com` before forwarding to an Exchange or IMAP backend looks
roughly like this:

```js
exports.hook_rcpt = (next, connection, params) => {
    const rcpt = params[0]
    const [user] = rcpt.user.split('-')
    rcpt.user = user
    next()
}
```

A comprehensive registry of community and core plugins — auth, DNSBLs, DKIM,
SpamAssassin, rspamd, Redis, ClamAV, queue backends, and many others — lives
in [Plugins.md][plugins]. To write your own, see the [plugin tutorial][tutorial].

## Documentation

- [Plugins.md][plugins] — plugin registry and configuration reference
- [docs/][docs] — core documentation (Connection, Transaction, Outbound, …)
- [Tutorial][tutorial] — step-by-step getting started guide
- [CHANGELOG.md][changelog] — release notes
- [SECURITY.md][security] — security policy and reporting

## Getting Help

- [GitHub Issues][issues]
- [Mailing list][mailing-list] (implemented as a Haraka plugin)
- [Screencast: Getting started with Haraka][screencast]

## Installation

Haraka requires [Node.js][1]. Install via [npm][npm]:

```sh
npm install -g Haraka
```

Create a service directory:

```sh
haraka -i /path/to/haraka_test
```

This creates `haraka_test` with `config/` and `plugins/` subdirectories and
sets the host name from `hostname(1)`. Edit `config/host_list` to add the
domains for which Haraka should accept mail.

Start Haraka:

```sh
haraka -c /path/to/haraka_test
```

## Configuration

Edit `config/plugins` to select active plugins. By default, mail addressed to
domains in `config/host_list` is accepted and forwarded via the
`smtp-forward` plugin (configured in `config/smtp_forward.ini`).

Per-plugin documentation is available via:

```sh
haraka -h plugins/<name>
```

See [Plugins.md][plugins] for the full registry.

## Running from Source

```sh
git clone https://github.com/haraka/Haraka.git
cd Haraka
npm install
node haraka.js
```

## Authorship and Maintenance

Haraka was created by [Matt Sergeant][matt-sergeant] (`baudehlo`), formerly
project leader of [SpamAssassin][spamassassin] and a contributor to
[Qpsmtpd][qpsmtpd]. The project is currently maintained by
[Matt Simerson][msimerson] (`msimerson`).

Haraka is the work of many hands. See [CONTRIBUTORS.md][contributors] for
the full list of people who have contributed code, documentation, and plugins.

## License

Haraka is released under the MIT License. See [LICENSE][license] for details.

[1]: https://nodejs.org/
[3]: https://en.wikipedia.org/wiki/Message_transfer_agent
[5]: https://en.wikipedia.org/wiki/Message_submission_agent
[6]: https://github.com/haraka/haraka-plugin-dkim
[7]: https://en.wikipedia.org/wiki/Mail_delivery_agent
[npm]: https://www.npmjs.com/package/Haraka
[plugins]: https://github.com/haraka/Haraka/blob/master/Plugins.md
[docs]: https://github.com/haraka/Haraka/tree/master/docs
[tutorial]: https://github.com/haraka/Haraka/blob/master/docs/Tutorial.md
[changelog]: https://github.com/haraka/Haraka/blob/master/CHANGELOG.md
[security]: https://github.com/haraka/Haraka/blob/master/SECURITY.md
[contributors]: https://github.com/haraka/Haraka/blob/master/CONTRIBUTORS.md
[license]: https://github.com/haraka/Haraka/blob/master/LICENSE
[issues]: https://github.com/haraka/Haraka/issues
[mailing-list]: mailto:haraka-sub@harakamail.com
[screencast]: https://youtu.be/6twKXMAsPsw
[matt-sergeant]: https://github.com/baudehlo
[msimerson]: https://github.com/msimerson
[spamassassin]: https://spamassassin.apache.org/
[qpsmtpd]: https://github.com/smtpd/qpsmtpd/
[cov-img]: https://codecov.io/github/haraka/Haraka/coverage.svg
[cov-url]: https://codecov.io/github/haraka/Haraka?branch=master
