Writing Haraka Plugins
======================

Part of the joy of using Haraka as your main mail server is having a strong
plugin based system which means you control all aspects of how your mail is
processed, accepted, and delivered.

Of course in order to control this you may at some point need to edit some
sort of plugin file of your own to customise how things work. The good news
is that writing plugins in Haraka is simple, even for novice coders. You
just need a little knowledge of Javascript (and maybe some understanding of
Node.js) and the world is your oyster.

This tutorial will run through a simple plugin which allows you to have
email addresses that expire in a short period of time. This is handy if you
want a *disposable email address* to use to sign up for a web site that you
don't wish to continually receive communication from.

The Design
----------

In order to make this simple, we are going to simply let you have tagged
email addresses such as `user-20120515@domain.com` which will expire on the
15th May, 2012. Haraka will then check the email has yet to expire, and
reject mails to that address after the expiry date. If the address hasn't
expired yet it will re-write the address to `user@domain.com` before onward
delivery.

This document assumes you already have Haraka setup and delivering your
inbound mail.

What You Will Need
------------------

* Node.js
* Haraka
* A text editor
* [swaks][1]
* A screwdriver

[1]: http://jetmore.org/john/code/swaks/

Getting Started
---------------

The first thing we need to do is create our empty plugin file and have
Haraka load it. This is as simple as:

    $ touch plugins/rcpt_to.disposable.js
    $ mv config/plugins config/.plugins; (echo rcpt_to.disposable; cat config/.plugins) > config/plugins

Note that the second command pre-pends rcpt_to.disposable to the list of
plugins - we do this because there will be a `rcpt` plugin later in the list
which confirms the `RCPT TO` commands as valid for your server. This later
plugin will mean no other `rcpt` plugins get run, so we need to pre-pend your
new plugin to the list.

Now fire up your favourite editor and put the following into
the `plugins/rcpt_to.disposable.js` file:

    exports.hook_rcpt = function (next, connection, params) {
		var rcpt = params[0];
		this.loginfo("Got recipient: " + rcpt);
		next();
	}

All we are doing here is logging the fact that we got the recipient.

Check this works. You'll need two terminal windows. In window 1:

    $ echo LOGDEBUG > config/loglevel
    $ node haraka.js

And in window 2:

    $ swaks -h domain.com -t booya@myserver.com -f somewhere@example.com \
      -s localhost -p 25

(this assumes you are running Haraka on localhost port 25)

In the logs you should see:

    [INFO] [rcpt_to.disposable] Got recipient: <booya@myserver.com>

Which indicates everything is working.

Parsing Out The Date
--------------------

Now lets check for emails with an expire date in them and turn them into
`Date` objects. Edit your plugin file as follows:

    exports.hook_rcpt = function (next, connection, params) {
		var rcpt = params[0];
		this.loginfo("Got recipient: " + rcpt);
		
		// Check user matches regex 'user-YYYYMMDD':
		var match = /^(.*)-(\d{4})(\d{2})(\d{2})$/.exec(rcpt.user);
		if (!match) {
			return next();
		}
		
		// get date - note Date constructor takes month-1 (i.e. Dec == 11).
		var expiry_date = new Date(match[2], match[3]-1, match[4]);
		
		this.loginfo("Email expires on: " + expiry_date);
		
		next();
	}

Start haraka again and pass it the following email via swaks:

    $ swaks -h domain.com -t booya-20120101@myserver.com \
      -f somewhere@example.com -s localhost -p 25

And you should see now in the logs:

    [INFO] [rcpt_to.disposable] Got recipient: <booya-20120101@myserver.com>
    [INFO] [rcpt_to.disposable] Email expires on: Sun, 01 Jan 2012 05:00:00 GMT

The exact time may vary depending on your timezone, but it should be obvious
we now have a date object, which we can now compare to the current date.

Rejecting Expired Emails
------------------------

The final edit we have to do is to add in code to compare to the current date
and reject expired emails. Again, this is very simple:

	exports.hook_rcpt = function (next, connection, params) {
		var rcpt = params[0];
		this.loginfo("Got recipient: " + rcpt);
	
		// Check user matches regex 'user-YYYYMMDD':
		var match = /^(.*)-(\d{4})(\d{2})(\d{2})$/.exec(rcpt.user);
		if (!match) {
			return next();
		}
	
		// get date - note Date constructor takes month-1 (i.e. Dec == 11).
		var expiry_date = new Date(match[2], match[3]-1, match[4]);
	
		this.loginfo("Email expires on: " + expiry_date);
		
		var today = new Date();
		
		if (expiry_date < today) {
			// If we get here, the email address has expired
			return next(DENY, "Expired email address");
		}
		
		next();
	}

And we can easily check that with swaks (remember to restart Haraka):

    $ swaks -h foo.com -t booya-20110101@haraka.local -f somewhere@example.com \
      -s localhost -p 25
	=== Trying localhost:25...
	=== Connected to localhost.
	<-  220 sergeant.org ESMTP Haraka 0.3 ready
	 -> EHLO foo.com
	<-  250-Haraka says hi Unknown [127.0.0.1]
	<-  250-PIPELINING
	<-  250-8BITMIME
	<-  250 SIZE 500000
	 -> MAIL FROM:<somewhere@example.com>
	<-  250 From address is OK
	 -> RCPT TO:<booya-20110101@haraka.local>
	<** 550 Expired email address
	 -> QUIT
	<-  221 closing connection. Have a jolly good day.
	=== Connection closed with remote host.

Now we need to do one more thing...

Fixing Up Unexpired Emails
--------------------------

The last thing we need to do, is if we have an email that isn't expired, we
need to normalise it back to the real email address, because wherever we
deliver this to is unlikely to recognise these new email addresses.

Here's how our final plugin will look:

	exports.hook_rcpt = function (next, connection, params) {
		var rcpt = params[0];
		this.loginfo("Got recipient: " + rcpt);

		// Check user matches regex 'user-YYYYMMDD':
		var match = /^(.*)-(\d{4})(\d{2})(\d{2})$/.exec(rcpt.user);
		if (!match) {
			return next();
		}

		// get date - note Date constructor takes month-1 (i.e. Dec == 11).
		var expiry_date = new Date(match[2], match[3]-1, match[4]);

		this.loginfo("Email expires on: " + expiry_date);
	
		var today = new Date();
	
		if (expiry_date < today) {
			// If we get here, the email address has expired
			return next(DENY, "Expired email address");
		}
		
		// now get rid of the extension:
		rcpt.user = match[1];
		this.loginfo("Email address now: " + rcpt);
		
		next();
	}

And when we test this with an unexpired address via swaks:

    $ swaks -h foo.com -t booya-20120101@haraka.local \
      -f somewhere@example.com -s localhost -p 25

We get in the logs:

	[INFO] [rcpt_to.disposable] Got recipient: <booya-20120101@haraka.local>
	[INFO] [rcpt_to.disposable] Email expires on: Sun Jan 01 2012 00:00:00 GMT-0500 (EST)
	[INFO] [rcpt_to.disposable] Email address now: <booya@haraka.local>

Which indicates that we have successfully modified the email address.

Further Reading
===============

There are many more features of the Haraka API to explore, including access
to the body of the email and the headers, access to the HELO string, and
implementing ESMTP extensions, among many others.

There are two good places to read up on these. Firstly is the documentation
in the Haraka "docs" directory. Start with the `Plugins.md` file, and work
your way through the API from there.

The second place is simply reading the source code for the plugins themselves.
The plugins that Haraka ships with use almost all parts of the API and so
should give you a good starting point if you want to implement a particular
piece of functionality. Even the most complicated plugins are under 200 lines
of code, so don't be intimidated by them! The simplest one is a mere 5 lines
of code.
