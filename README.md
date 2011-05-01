Haraka - a Node.js Mail Server
------------------------------

Haraka is a plugin capable SMTP server. It uses a highly scalable event
model to be able to cope with thousands of concurrent connections. Plugins
are written in Javascript using [Node.js][1], and as such perform extremely
quickly.

Haraka can be used either as an inbound SMTP server, and is designed with
good anti-spam protections in mind (see the plugins directory), or it can
be used as an outbound mail server (run it on port 587 with an "auth" plugin
to authenticate your users).

What Haraka doesn't do is fully replace your mail system (yet). It currently
has no built-in facilities for mapping email addresses to user accounts and
delivering them to said accounts. For that we expect you to keep something
like postfix, exim or any other user-based mail system, and have Haraka
deliver mail to those systems for that mapping. However nothing is stopping
someone writing a plugin which replicates that facility - it just has yet to
be done.

Haraka does have a scalable outbound mail delivery engine in the `deliver`
plugin, which should work well for most sites.

### Why Use Haraka?

Haraka's primary purpose is to provide you with a much easier to extend
mail server than most available SMTP servers out there such as Postfix,
Exim or Microsoft Exchange, yet while still running those systems for their
excellent ability to deliver mail to users.

The plugin system makes it trivial to code new features. A typical example
might be to provide qmail-like extended addresses to an Exchange system,
whereby you could receive mail as `user-anywordshere@domain.com`, and yet
still have it correctly routed to `user@domain.com`. This is a few lines of
code in Haraka, or maybe someone has already written this plugin.

Plugins are already provided for running mail through SpamAssassin, checking
for known bad HELO patterns, checking DNS Blocklists, and watching for
violators of the SMTP protocol via the "early_talker" plugin.

Furthermore Haraka comes with a simple plugin called "graph" which shows you
real-time charts of which plugins rejected the most mail, allowing you to
easily fine-tune your list of plugins to more effectively stop spam.

### Running Haraka

Haraka is written in Javascript and requires [node.js][1] to run.

Starting Haraka is simple. First edit the supplied <tt>config/smtp.ini</tt>
file to determine which host and port to run on. Then edit
<tt>config/me</tt> to give your server an appropriate name (usually your
hostname is correct, but in a multi-server setup you may wish to use a
unified name).

Finally just start Haraka:

    node haraka.js

And it will run.

However the big thing you need to do next is to edit the <tt>config/plugins</tt>
file. This determines what plugins run in Haraka, and controls the overall
behaviour of the server. For example if you want to proxy connections to
a backend SMTP server you want to set your queue plugin to be
<tt>queue/smtp_proxy</tt>. Have a good look over the plugins in the
<tt>plugins/</tt> directory to see what is applicable to your setup.

As a typical example here is what I have on my personal server:

	dnsbl
	data.nomsgid
	data.noreceived
	data.signatures
	data.uribl
	early_talker
	graph
	helo.checks
	mail_from.is_resolvable
	mail_from.nobounces
	max_unrecognized_commands
	rcpt_to.in_host_list
	rcpt_to.max_count
	rdns.regexp
	queue/qmail-queue

However this may not be to your taste. Also bear in mind that each plugin
often has configuration of its own. Look at the code, and if it's not
obvious just email me at helpme@gmail.com and I'll give you some assistance.

### Performance

Haraka is fast, due to the nature of using the v8 Javascript engine, and
it is scalable due to using async I/O everywhere. On my local system I have
managed to scale it up to 5000 emails per second (with minimal plugins).

I welcome other performance evaluations.

### License and Author

Haraka is MIT licensed - see the LICENSE file for details.

Haraka is a project started by Matt Sergeant, a 10 year veteran of the email
and anti-spam world. Previous projects have been the project leader for
SpamAssassin and a hacker on Qpsmtpd, a perl based mail server which is 
quite similar to Haraka (but not as fast due to perl being slower than
Javascript).

[1]: http://nodejs.org/
