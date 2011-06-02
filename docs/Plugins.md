Writing Haraka Plugins
=======

All aspects of receiving an email in Haraka are controlled via plugins, to the
extent that no mail will even be received unless you have a minimum of a 'rcpt'
plugin and a 'queue' plugin.

The 'rcpt' plugin is used to determine if a particular recipient should be
allowed to be relayed for. The 'queue' plugin queue's the email somewhere -
perhaps to disk, or perhaps to an onward SMTP server.

Anatomy of a Plugin
------

Plugins in Haraka are simply Javascript files in the plugins/ directory.

To enable a plugin, simply add its name to `config/plugins`.

In order to hook into the "rcpt" event, simply create a method in exports
to hook it:

    exports.hook_rcpt = function (next, connection, params) {
        // email address is in params[0]
        // do something with the address... then call:
        next(OK);
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

Plugins inherit all the logging methods of logger.js, which are:

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

Then when the earlier hook calls next() it continues on to the next hook to try
that one.

The Next Function
=================

The next() function takes two optional parameters: code, msg

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

  Required by rcpt and queue plugins if are to allow the email, or the queue was
successful, respectively.


Available Hooks
-------------

These are just the name of the hook, with any parameter sent to it:

* connect - called after we got rDNS
* unrecognized_command - called when the remote end sends a command we don't recognise
* disconnect - called upon disconnect
* helo (hostname)
* ehlo (hostname)
* quit
* vrfy
* noop
* mail ([from, esmtp\_params])
* rcpt ([to,   esmtp\_params])
* data
* data_post
* queue
* deny - called if a plugin returns one of DENY, DENYSOFT or DENYDISCONNECT

Further Reading
--------------

Now you want to read about the Connection object.


