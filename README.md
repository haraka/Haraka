Haraka - a Node.js Mail Server
------------------------------

Haraka is a plugin capable SMTP server. It uses a highly scalable event
model to be able to cope with thousands of concurrent connections. Plugins
are written in Javascript using [Node.js][1], and as such perform extremely
quickly.

Haraka can be used either as an inbound SMTP server, and is designed with
good anti-spam protections in mind (see the plugins directory), or it can
be used as a lightweight outbound mail server (run it on port 587 with an
"auth" plugin to authenticate your users).

What Haraka doesn't do is fully replace your mail system. It doesn't do
mail queueing or delivery with retries. For that we expect you to have
something like postfix, exim or qmail installed already. It also doesn't
have an inbound message store, for that you should probably run an IMAP
server.

### Why Use Haraka Then?

Haraka's primary purpose is to provide you with a much easier to extend
mail server than most available SMTP servers out there such as Postfix,
Exim or Microsoft Exchange, yet while still running those systems for their
excellent ability to deliver mail to users.

The plugin system makes it trivial to code new features. A typical example
might be to provide qmail-like extended addresses to an Exchange system,
whereby you could receive mail as user-anywordshere@domain.com, and yet
still have it correctly routed to user@domain.com. This is a few lines of
code in Haraka, or maybe someone has already written this plugin.

Plugins are already provided for running mail through SpamAssassin, checking
for known bad HELO patterns, checking DNS Blocklists, and watching for
violators of the SMTP protocol via the "early_talker" plugin.

Furthermore Haraka comes with a simple plugin called "graph" which shows you
real-time charts of which plugins rejected the most mail, allowing you to
easily fine-tune your list of plugins to more effectively stop spam.

### Running Haraka

Haraka requires [node.js][1] to run.

Starting Haraka is simple. First edit the supplied <tt>config/smtp.ini</tt>
file to determine which host and port to run on. Then edit
<tt>config/me</tt> to give your server an appropriate name (usually your
hostname is correct, but in a multi-server setup you may wish to use a
unified name). Finally just start Haraka:

    node haraka.js

And it will run.

(Adding in daemonisation code and inetd code is left as an exercise, for now)

[1]: http://nodejs.org/
