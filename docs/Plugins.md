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

They are loaded via require() and so must compile as valid Javascript or your
server will not start.

Firstly, to enable a plugin, simply add its name to config/plugins.

In order to hook into the "rcpt" event, simply create a method in exports
to hook it:

    var smtp = require('../constants');
    
    exports.hook_rcpt = function(callback, connection, params) {
        // email address is in params[0]
        // do something with the address... then call:
        callback(smtp.ok);
    };

We've introduced several new concepts here, so let's go through them:

* constants - the file constants.js contains a bunch of SMTP relevant constants
that we must pass to our callback.
* callback - we need to call this when we are done processing or Haraka will
hang.
* exports - the plugin acts as an object (with access to "this" if you need it)
but methods go directly into exports.

The callback is the most critical thing here - since Haraka is an event based
SMTP server, we may need to go off and fetch network information before we
can return a result. We can do that asynchronously and simply run the callback
when we are done, which allows Haraka to go on processing other clients while
we fetch our information.

Logging
------

Plugins inherit all the logging methods of logger.js, which are:

* logdebug
* loginfo
* lognotice
* logwarn
* logerror
* logcrit
* logalert
* logemerg

It should also be noted that if plugins throw an exception directly when in a
hook the exception will be caught and generate a logcrit level error.

Remember to always use this.logwarn() (or other method) when logging from a
plugin if you can because it includes extra information in the output.

Multiple Hooks
-----

You can hook the same event multipe times, to do that provide a register()
method and hook it:

    exports.register = function() {
        this.register_hook('queue', 'try_queue_my_way');
        this.register_hook('queue', 'try_queue_highway');
    };

Then when the earlier hook calls callback(smtp.cont) it continues on to the
next hook to try that one.

Callback Return Values
------------------

Assuming: var smtp = require('../constants'):

* smtp.cont

Continue and let other plugins handle this particular hook.

* smtp.deny

Reject the mail with a 5xx error.

* smtp.denysoft

Reject the mail with a 4xx error.

* smtp.denydisconnect

Reject the mail with a 5xx error and immediately disconnect.

* smtp.disconnect

Simply immediately disconnect

* smtp.ok

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
* mail (from, esmtp\_params)
* rcpt (to, esmtp\_params)
* data
* queue

Further Reading
--------------

Now you want to read about the Connection object and the Transaction object.

