Writing Haraka Plugins
=======

All aspects of receiving an email in Haraka are controlled via plugins. No
mail can even be received unless at least a 'rcpt' and 'queue' plugin are
enabled.

'rcpt' plugins determine if a particular recipient is allowed to be relayed
or received for. A 'queue' plugin queue's the email somewhere - normally to
disk or to an another SMTP server.

Get a list of built-in plugins by running:

`haraka -l -c /path/to/config`

Display the help text for a plugin by running:

`haraka -h <name> -c /path/to/config`

Omit the `-c /path/to/config` to see only the plugins supplied with Haraka
(not your local plugins in your `config` directory).

Anatomy of a Plugin
------

Plugins in Haraka are Javascript files in the plugins/ directory.

To enable a plugin, add its name to `config/plugins`.

To hook into the "rcpt" event, create a method in exports
to hook it:

    exports.hook_rcpt = function (next, connection, params) {
        // email address is in params[0]
        // do something with the address... then call:
        next();
    };

That hook introduces a couple of new concepts so let's go through them:

* next - call this when done processing or Haraka will hang.
* exports - the plugin is an object (with access to "this" if you need it)
but methods go directly into exports.

The next() method is the most critical thing here - since Haraka is event
based, we may need to go fetch network information before returning a
result. This is doneasynchronously and we run next() when we are done, 
allowing Haraka to go process other clients while we wait for information.

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

If plugins throw an exception when in a hook, the exception will be caught
and generate a logcrit level error. However, exceptions will not be caught
as gracefully when plugins are running async code. Use error codes for that,
log the error, and run your next() function appropriately.

Multiple Hooks
-----

To hook the same event multiple times, provide a register()
method and hook it:

    exports.register = function() {
        this.register_hook('queue', 'try_queue_my_way');
        this.register_hook('queue', 'try_queue_highway');
    };

When the earlier hook calls `next()` (without parameters) it continues
to the next registered hook.

If you have a single hook function that runs on multiple hooks you can
determine which hook it is running on when it is called by checking the
`hook` property of the first argument received by that hook (this will
typically be `connection` or `hmail`) e.g. `connection.hook`

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
run after it. (excepting for connect_init and disconnect).

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
* connect\_init - used to init data structures, called for *every* connection
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

The `connect_init` hook is also special in that all return codes are ignored.
This is so that plugins that need to do initialization for every connection
can be assured they will run. To accomplish this, return values are ignored.

Hook Run Order
--------------

The ordering of hooks is determined by the SMTP protocol, some knowledge of
RFC5321 is required.

##### Typical Inbound mail

- hook_connect_init
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

By 'outbound' we mean messages that use Haraka's built-in queueing and delivery
mechanism. This is used when `connection.relaying = true` is set during the message transaction
and `hook_queue_outbound` is called to queue the message.

The Outbound hook ordering will mirror the Inbound mail order above until after `hook_queue_outbound`, which is followed by:

- hook_send_email
- hook_get_mx
- hook_delivered **OR** hook_deferred **OR** hook_bounce
  - hook_delivered  (called once per delivery domain with at least one successfull recipient)
  - hook_deferred  (called once per delivery domain where at least one recipient or connection was deferred)
  - hook_bounce  (called once per delivery domain where the recipient(s) or message was rejected by the destination)
 
Plugin Run Order
----------------

Plugins are run on each hook in the order that they are specified in 
`config/plugins`. When a plugin returns anything other than `next()` on a hook, 
all subsequent plugins due to run on that hook are skipped.

This is important as some plugins might rely on `results` or `notes` that have
been set by plugins that need to run before them. This should be noted in the
plugins documentation. Make sure to read it.

If you are writing a complex plugin, you may have to split it into multiple
plugins to run in a specific order e.g. you want hook_deny to run last after
all other plugins and hook_lookup_rdns to run first, then you can explicitly 
register your hooks and provide a `priority` value which is an integer between
-100 (highest priority) to 100 (lowest priority) which defaults to 0 (zero) if
not supplied.  You can apply a priority to your hook in the following way:

````
exports.register = function() {
    var plugin = this;
    plugin.register_hook('connect',  'hook_connect', -100);
}
````

This would ensure that your hook_connect function will run before any other
plugins registered on the `connect` hook, regardless of the order it was 
specified in `config/plugins`.

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

* hmail.todo.notes

  Available on any outbound hook that passes `hmail` as a function parameter.  
  This is the same object as 'connection.transaction.notes', so anything 
  you store in the transaction notes is automatically available in the 
  outbound functions here.
  
All of these notes are simply a Javascript object underneath - so you use
them like a simple key/value store e.g.

    connection.transaction.notes.test = 'testing';

## See also, [Results](Results.md)


Further Reading
--------------

Now you want to read about the [Connection](Connection.md) object.

Outbound hooks are [also documented](Outbound.md).

