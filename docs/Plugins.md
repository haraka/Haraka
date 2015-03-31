Writing Haraka Plugins
=======

All aspects of receiving an email in Haraka are controlled via plugins, to the
extent that no mail will even be received unless you have a minimum of a 'rcpt'
plugin and a 'queue' plugin.

The 'rcpt' plugin is used to determine if a particular recipient should be
allowed to be relayed or received for. The 'queue' plugin queue's the email
somewhere - perhaps to disk, or perhaps to an onward SMTP server.

You can get a list of built-in plugins by running:

`haraka -l -c /path/to/config`

and display the help text for a plugin by running:

`haraka -h <name> -c /path/to/config`

You can omit the `-c /path/to/config` if you want to only see the plugins 
supplied with Haraka and not your own local plugins in your `config` directory.

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

* HOOK\_NEXT

  This is a special return value that is currently only available on the
`unrecognized_command` hook.  It instructs Haraka to run a different plugin
hook instead of responding normally.  The `msg` argument is required and
must be set to the name of the hook that is to be run.


Available Hooks
-------------

These are just the name of the hook, with any parameter sent to it:

* init\_master - called when the main (master) process is started
* init\_child - called whenever a child process is started when using multiple "nodes"
* lookup\_rdns - called to look up the rDNS - return the rDNS via `next(OK, rdns)`
* connect - called after we got rDNS
* capabilities - called to get the ESMTP capabilities (such as STARTTLS)
* unrecognized\_command - called when the remote end sends a command we don't recognise
* disconnect - called upon disconnect
* helo (hostname)
* ehlo (hostname)
* quit
* vrfy
* noop
* rset
* mail ([from, esmtp\_params])
* rcpt ([to,   esmtp\_params])
* rcpt\_ok (to)
* data - called at the DATA command
* data\_post - called at the end-of-data marker
* max\_data\_exceeded - called if the message is bigger than connection.max\_bytes
* queue - called to queue the mail
* queue\_outbound - called to queue the mail when connection.relaying is set
* queue\_ok - called when a mail has been queued successfully
* reset\_transaction - called before the transaction is reset (via RSET, or MAIL)
* deny - called if a plugin returns one of DENY, DENYSOFT or DENYDISCONNECT
* get\_mx (hmail, domain) - called when sending outbound mail to lookup the MX record
* deferred (hmail, params) - called when sending outbound mail if the mail was deferred
* bounce (hmail, err) - called when sending outbound mail if the mail would bounce
* delivered (hmail, [host, ip, response, delay, port, mode, ok_recips, secured, authenticated]) - 
called when outbound mail is delivered to the destination
* send\_email (hmail) - called when outbound is about to be sent

The `rcpt` hook is slightly special. If we have a plugin (prior to rcpt) that
sets the `connection.relaying = true` flag, then we do not need any rcpt
hooks, or if we do, none of them need call `next(OK)`. However if
`connection.relaying` remains `false` (as is the default - you don't want an
open relay!), then one rcpt plugin MUST return `next(OK)` or your sender
will receive the error message "I cannot deliver for that user". The default
plugin for this is `rcpt_to.in_host_list`, which
lists the domains for which you wish to receive email.

If a rcpt plugin DOES call `next(OK)` then the `rcpt_ok` hook is run. This
is primarily used by the `queue/smtp_proxy` plugin which needs to run after
all rcpt hooks.

Hook Run Order
--------------

The ordering of hooks is determined by the SMTP protocol, some knowledge of
RFC5321 is required.

##### Typical Inbound mail

- hook_lookup_rdns
- hook_connect
- hook_helo **OR** hook_ehlo (EHLO is sent when ESMTP is desired which allows extensions
such as STARTTLS, AUTH, SIZE etc.)
    - hook_helo
    - hook_ehlo
      - hook_capabilities
      - *hook_unrecognized_command* will run for each ESMTP extension the client requests 
e.g. STARTTLS, AUTH etc.)
  - hook_mail
  - hook_rcpt (this will run once per-recipient)
  - hook_rcpt_ok (this will run for every recipient that hook_rcpt returned `next(OK)` for)
  - hook_data
  - *[attachment hooks]*
  - hook_data_post
  - hook_queue **OR** hook_queue_outbound
  - hook_queue_ok (called if hook_queue or hook_queue_outbound returns `next(OK)`)
- hook_quit **OR** hook_rset **OR** hook_helo **OR** hook_ehlo (the client can either 
disconnect once a message has been sent or it can start a new transaction by sending RSET, EHLO
or HELO to reset the transaction and then start a new transaction by starting with MAIL again)
  - hook_reset_transaction
- hook_disconnect

##### Typical Outbound mail

When we say outbound here - we mean messages that use Haraka built-in queueing and delivery
mechanisms which are used when `connection.relaying = true` is set during the message transaction
and `hook_queue_outbound` is called to queue the message.

The Outbound ordering will be the mirror the Inbound mail order above until `hook_queue_outbound`
is reached, after that the order is:

- hook_send_email
- hook_get_mx
- hook_delivered **OR** hook_deferred **OR** hook_bounce
  - hook_delivered  (called once per delivery domain with at least one successfull recipient)
  - hook_deferred  (called once per delivery domain where at least one recipient or connection was deferred)
  - hook_bounce  (called once per delivery domain where the recipient(s) or message was rejected by the destination)
 
Plugin Run Order
----------------

Plugins will be run on each hook in the order that they are specified on 
`config/plugins`.  If a plugin returns anything other than `next()` on a hook, 
then all subsequent plugins due to run on that hook will be skipped.

This is important as some plugins might rely on `results` or `notes` that have
been set by plugins that need to run before them.   This should be noted in the
plugins documentation though, so you should make sure that you read it.

If you are writing complex plugins of your own, you may find that you have to 
split your plugins into multiple plugins if you require your hooks to run in a 
specific order e.g. you want hook_deny to run last after all other plugins and
hook_lookup_rdns to run first, then you'd need two plugins to achieve this.

You can check the order that the plugins will run on each hook by running:

`haraka -o -c /path/to/config`

Sharing State
-------------

There are several cases where you might need to share information between
plugins.  This is done using `notes` - there are three types available:

* server.notes

  Available in all plugins.  This is created at PID start-up and is shared
  amongst all plugins on the same PID and listener.
  Typical uses for notes at this level would be to share database
  connections between multiple plugins or connection pools etc.

* connection.notes

  Available on any hook that passes 'connection' as a function parameter.
  This is shared amongst all plugins for a single connection and is
  destroyed after the client disconnects.
  Typical uses for notes at this level would be to store information
  about the connected client e.g. rDNS names, HELO/EHLO, white/black
  list status etc.

* connection.transaction.notes

  Available on any hook that passes 'connection' as a function parameter
  between hook\_mail and hook\_data\_post.
  This is shared amongst all plugins for this transaction (e.g. MAIL FROM
  through until a message is received or the connection is reset).
  Typical uses for notes at this level would be to store information
  on things like greylisting which uses client, sender and recipient
  information etc.

All of these notes are simply a Javascript object underneath - so you use
them like a simple key/value store e.g.

    connection.transaction.notes.test = 'testing';

## See also, [Results](Results)


Further Reading
--------------

Now you want to read about the Connection object.

Outbound hooks are documented in Outbound.md.


