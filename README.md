
Haraka - a Node.js Mail Server
------------------------------

[![Build Status][ci-img]][ci-url]
[![Coverage Status][cov-img]][cov-url]
[![Windows Status][ci-win-img]][ci-win-url]
[![Greenkeeper badge](https://badges.greenkeeper.io/haraka/Haraka.svg)](https://greenkeeper.io/)


Haraka is a highly scalable [node.js][1] email server with a modular
plugin architecture. Haraka can serve thousands of concurrent connections
and deliver thousands of messages per second. Haraka and plugins are written
in asyncronous JS and are very fast.

Haraka has very good spam protection (see [plugins][4]) and works
well as a filtering [MTA][3]. It also works well as a [MSA][5] running on
port 587 with auth and [dkim_sign][6] plugins enabled.

Haraka makes no attempt to be a mail store (like Exchange or Postfix/Exim/Qmail),
a [LDA][7], nor an IMAP server (like Dovecot or Courier). Haraka is
typically used **with** such systems.

Haraka has a scalable outbound mail delivery engine built in. Mail
marked as `relaying` (such as via an `auth` plugin) is automatically
queued for outbound delivery.

### Getting Help

* [Join the mailing list][8] (implemented as a Haraka plugin)
* Join us on IRC at `#haraka` on [freenode][14]
* [GitHub Issues](https://github.com/haraka/Haraka/issues)


### Screencast

[Getting started with Haraka][2]

### Why Use Haraka?

Haraka's plugin architecure provides an easily extensible MTA that
complements traditional MTAs that excel at managing mail stores but do
not have sufficient filtering.

The plugin system makes it easy to code new features. A typical example
is providing qmail-like extended addresses to an Exchange system,
whereby you could receive mail as `user-anyword@domain.com`, and yet
still have it correctly routed to `user@domain.com`. This is a few lines of
code in Haraka.

Plugins are provided for running mail through [SpamAssassin][9], validating
[HELO][10] names, checking [DNS Blocklists][11], and [many others][12].


### Installing Haraka

Haraka requires [node.js][1] to run. Install Haraka with [npm][2]:

```sh
npm install -g Haraka
```

After installion, use the `haraka` binary to set up the service.

### Running Haraka

First, create the service:

```sh
haraka -i /path/to/haraka_test
```

That creates the directory `haraka_test` with `config` and `plugin`
directories within. It also sets the host name used by Haraka
to the output of `hostname`.

If `hostname` is not correct, edit `config/host_list`. For example,
to receive mail addressed to `user@domain.com`, add `domain.com` to the
`config/host_list` file.

Finally, start Haraka using root permissions:

```sh
haraka -c /path/to/haraka_test
```

And it will run.

### Configure Haraka

To choose which plugins run, edit `config/plugins`. Plugins control the
overall behaviour of Haraka. By default, only messages to domains listed
in `config/host_list` will be accepted and then delivered via the
`smtp-forward` plugin. Configure the destination in `config/smtp_forward.ini`.


### Read the Fine Manual

```sh
haraka -h plugins/$name
```

The docs detail how each plugin is configured. After editing
`config/plugins`, restart Haraka and enjoy!


### Running from git

If you are unable to use npm to install Haraka, you can run from git by
following these steps:

First clone the repository:

    $ git clone https://github.com/haraka/Haraka.git
    $ cd Haraka

Install Haraka's node.js dependencies locally:

    $ npm install

Edit `config/plugins` and `config/smtp.ini` to specify the plugins and
config you want.

Finally run Haraka:

    $ node haraka.js

### License and Author

Haraka is MIT licensed - see the LICENSE file for details.

Haraka is a project started by Matt Sergeant, a 10 year veteran of the email
and anti-spam world. Previous projects have been the project leader for
SpamAssassin and a hacker on [Qpsmtpd][13].

[1]: http://nodejs.org/
[2]: http://youtu.be/6twKXMAsPsw
[3]: http://en.wikipedia.org/wiki/Message_transfer_agent
[4]: https://github.com/haraka/Haraka/blob/v3/Plugins.md
[5]: http://en.wikipedia.org/wiki/Mail_submission_agent
[6]: https://github.com/haraka/Haraka/blob/master/docs/plugins/dkim_sign.md
[7]: https://en.wikipedia.org/wiki/Mail_delivery_agent
[8]: mailto:haraka-sub@harakamail.com
[9]: https://haraka.github.io/manual/plugins/spamassassin.html
[10]: https://haraka.github.io/manual/plugins/helo.checks.html
[11]: https://haraka.github.io/manual/plugins/dnsbl.html
[12]: https://github.com/haraka/Haraka/tree/master/plugins
[13]: https://github.com/smtpd/qpsmtpd/
[14]: https://freenode.net/irc_servers.shtml

[ci-img]: https://travis-ci.org/haraka/Haraka.svg?branch=master
[ci-url]: https://travis-ci.org/haraka/Haraka
[cov-img]: https://codecov.io/github/haraka/Haraka/coverage.svg
[cov-url]: https://codecov.io/github/haraka/Haraka?branch=master
[ci-win-img]: https://ci.appveyor.com/api/projects/status/g29l24w7qwoam47f?svg=true
[ci-win-url]: https://ci.appveyor.com/project/msimerson/haraka-pa8a5
