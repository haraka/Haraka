Writing Haraka Plugins
=======

All aspects of receiving an email in Haraka are controlled via plugins, to the
extent that no mail will even be received unless you have a minimum of a 'rcpt'
plugin and a 'queue' plugin.

The 'rcpt' plugin is used to determine if a particular recipient should be
allowed to be relayed or received for. The 'queue' plugin queue's the email
somewhere - perhaps to disk, or perhaps to an onward SMTP server.

Anatomy of a Plugin
------

Plugins in Haraka are simply Javascript files in the plugins/ directory.

To enable a plugin, simply add its name to `config/plugins`.

In order to hook into the "rcpt" event, simply create a method in exports
to hook it:

    exports.hook_rcpt = function (next, connection, params) {
        // email address is in params[0]
        // do something with the address... then call:
        next();
    };

We've introduced a couple of new concepts here, so let's go through them:

* next - we need to call this when we are done processing or Haraka will
hang.
* exports - the plugin acts as an object (with access to "this" if you need it)
but methods go directly into exports.

The next() method is the most critical thing here - since Haraka is an event based
SMTP server, we may need to go off and fetch network information before we
can return a result. We can do that asynchronously and simply run next()
when we are done, which allows Haraka to go on processing other clients while
we fetch our information.

See "The Next Function" below for more details.

Logging
------

Plugins inherit all the logging methods of `logger.js`, which are:

* logprotocol
* logdebug
* loginfo
* lognotice
* logwarn
* logerror
* logcrit
* logalert
* logemerg

It should also be noted that if plugins throw an exception directly when in a
hook the exception will be caught and generate a logcrit level error. However
they will not be caught quite as gracefully if you are in async code within
your plugin. Use error codes for that, log the error, and run your next()
function appropriately.

Multiple Hooks
-----

You can hook the same event multipe times, to do that provide a register()
method and hook it:

    exports.register = function() {
        this.register_hook('queue', 'try_queue_my_way');
        this.register_hook('queue', 'try_queue_highway');
    };

Then when the earlier hook calls `next()` (without parameters) it continues on
to the next hook you registered to try that one.

The Next Function
=================

The next() function takes two optional parameters: `code` and `msg`

The code is one of the below listed return values. The msg corresponds with
the string to send to the client in case of a failure. Use an Array if you need
to send back a multi-line response. The msg should NOT contain the code number
- that is taken care of by the Haraka internals.

Return Values
-------------

These constants are compiled into your plugin when it is loaded, you do not
need to define them:

* CONT

  Continue and let other plugins handle this particular hook. This is the
  default if no parameters are given.

* DENY

  Reject the mail with a 5xx error.

* DENYSOFT

  Reject the mail with a 4xx error.

* DENYDISCONNECT

  Reject the mail with a 5xx error and immediately disconnect.

* DISCONNECT

  Simply immediately disconnect

* OK

  Required by rcpt and queue plugins if we are to allow the email to be
accepted, or the queue was successful, respectively. 

  This also has a special meaning when used on deny hook.  Returning OK
on the deny hook will override the result to CONT.

  Once a plugin calls next(OK) no further plugins on the same hook will 
run after it.

* HOOK_NEXT

  This is a special return value that is currently only available on the
unrecognized_command hook.  It instructs Haraka to run a different plugin
hook instead of responding normally.  The `msg` argument is required and
must be set to the name of the hook that is to be run.


Available Hooks
-------------

These are just the name of the hook, with any parameter sent to it:

* init_master - called when the main (master) process is started
* init_child - called whenever a child process is started when using multiple "nodes"
* lookup_rdns - called to look up the rDNS - return the rDNS via `next(OK, rdns)`
* connect - called after we got rDNS
* capabilities - called to get the ESMTP capabilities (such as STARTTLS)
* unrecognized_command - called when the remote end sends a command we don't recognise
* disconnect - called upon disconnect
* helo (hostname)
* ehlo (hostname)
* quit
* vrfy
* noop
* rset
* mail ([from, esmtp\_params])
* rcpt ([to,   esmtp\_params])
* rcpt_ok (to)
* data - called at the DATA command
* data_post - called at the end-of-data marker
* queue - called to queue the mail
* queue_ok - called when a mail has been queued successfully
* deny - called if a plugin returns one of DENY, DENYSOFT or DENYDISCONNECT
* get_mx - called when sending outbound mail to lookup the MX record
* bounce - called when sending outbound mail if the mail would bounce

The `rcpt` hook is slightly special. If we have a plugin (prior to rcpt) that
sets the `connection.relaying = true` flag, then we do not need any rcpt
hooks, or if we do, none of them need call `next(OK)`. However if
`connection.relaying` remains `false` (as is the default - you don't want an
open relay!), then one rcpt plugin MUST return `next(OK)` or your sender
will receive the error message "I cannot deliver for that user". The most
obvious choice for this activity is the `rcpt_to.in_host_list` plugin, which
lists the domains for which you wish to receive email.

If a rcpt plugin DOES call `next(OK)` then the `rcpt_ok` hook is run. This
is primarily used by the queue/smtp_proxy plugin which needs to run after
all rcpt hooks.

Further Reading
--------------

Now you want to read about the Connection object.


