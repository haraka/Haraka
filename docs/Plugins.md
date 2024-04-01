# Plugins

Most aspects of receiving an email in Haraka are controlled by plugins. Mail cannot even be received unless at least a 'rcpt' and 'queue' plugin are
enabled.

Recipient (*rcpt*) plugins determine if a particular recipient is allowed to be relayed or received for. A *queue* plugin queues the message somewhere - normally to disk or to an another SMTP server.

## Plugin Lists

Get a list of installed plugins by running `haraka -l`. To include locally installed plugins, add the `-c /path/to/config` option.

We also have a [registry of known plugins](https://github.com/haraka/Haraka/blob/master/Plugins.md).

Display the help text for a plugin by running:

`haraka -h <name> -c /path/to/config`

# Writing Haraka Plugins

## Overview


## Anatomy of a Plugin

Plugins in Haraka are JS files in the `plugins` directory (legacy) and npm
modules in the node\_modules directory. See "Plugins as Modules" below.

Plugins can be installed in the Haraka global directory (default:
/$os/$specific/lib/node\_modules/Haraka) or in the Haraka install directory
(whatever you chose when you typed `haraka -i`. Example: `haraka -i /etc/haraka`

To enable a plugin, add its name to `config/plugins`. For npm packaged plugins, the name does not include the `haraka-plugin` prefix.

### Register

Register is the only plugin function that is syncronous and receives no arguments. Its primary purpose is enabling your plugin to register SMTP hooks. It is also used for syncronous initialization tasks such as [loading a config file](https://github.com/haraka/haraka-config). For heavier initialization tasks such as establishing database connections, look to `init_master` and `init_child` instead.

### Register a Hook

There are two ways for plugins to register hooks. Both examples register a function on the *rcpt* hook:

1. The `register_hook` function in register():

```js
exports.register = function () {
    this.register_hook('rcpt', 'my_rcpt_validate')
};

exports.my_rcpt_validate = function (next, connection, params) {
    // do processing
    next()
};
```

2. The hook_[$name] syntax:

```js
exports.hook_rcpt = function (next, connection, params) {
    // do processing
    next()
}
```

The register_hook function within `register()` offers a few advantages:

1. register a hook multiple times (see below)
2. a unique function name in stack traces
3. [a better function name](https://google.com/search?q=programming%20good%20function%20names)
4. hooks can be registered conditionally (ie, based on a config setting)

### Register a Hook Multiple Times

To register the same hook more than once, call `register_hook()` multiple times with the same hook name:

```js
exports.register = function () {
    this.register_hook('queue', 'try_queue_my_way')
    this.register_hook('queue', 'try_queue_highway')
};
```

When `try_queue_my_way()` calls `next()`, the next function registered on hook *queue* will be called, in this case, `try_queue_highway()`.

#### Determine hook name

When a single function runs on multiple hooks, the function can check the
*hook* property of the *connection* or *hmail* argument to determine which hook it is running on:

```js
exports.register = function () {
    this.register_hook('rcpt',    'my_rcpt')
    this.register_hook('rcpt_ok', 'my_rcpt')
};
 
exports.my_rcpt = function (next, connection, params) {
    const hook_name = connection.hook; // rcpt or rcpt_ok
    // email address is in params[0]
    // do processing
}
```

### Next()

After registering a hook, functions are called with that hooks arguments (see **Available Hooks** below. The first argument is a callback function, conventionally named `next`. When the function is completed, it calls `next()` and the connection continues. Failing to call `next()` will result in the connection hanging until that plugin's timer expires.

`next([code, msg])` accepts two optional parameters:

1. `code` is one of the listed return codes.
2. `msg` is a string to send to the client in case of a failure. Use an array to send a multi-line message. `msg` should NOT contain the code number - that is handled by Haraka.

#### Next() Return Codes

These constants are in your plugin when it is loaded, you do not
need to define them:

* CONT

  Continue and let other plugins handle this particular hook. This is the
  default. These are identical: `next()` and `next(CONT)`;

* DENY - Reject with a 5xx error.

* DENYSOFT - Reject with a 4xx error.

* DENYDISCONNECT - Reject with a 5xx error and immediately disconnect.

* DISCONNECT - Immediately disconnect

* OK

  Required by `rcpt` plugins to accept a recipient and `queue` plugins when the queue was successful.

  After a plugin calls `next(OK)`, no further plugins on that hook will run.

  Exceptions to next(OK):

    * connect_init and disconnect hooks are **always called**.

    * On the deny hook, `next(OK)` overrides the default CONT.

* HOOK\_NEXT

  HOOK_NEXT is only available on the `unrecognized_command` hook. It instructs Haraka to run a different plugin hook. The `msg` argument must be set to the name of the hook to be run. Ex: `next(HOOK_NEXT, 'rcpt_ok');`

## Available Hooks

These are the hook and their parameters (next excluded):

* init\_master - called when the main (master) process is started
* init\_child - in cluster, called when a child process is started
* init\_http - called when Haraka is started.
* init_wss - called after init_http
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
* max\_data\_exceeded - called when the message exceeds connection.max\_bytes
* queue - called to queue the mail
* queue\_outbound - called to queue the mail when connection.relaying is set
* queue\_ok - called when a mail has been queued successfully
* reset\_transaction - called before the transaction is reset (via RSET, or MAIL)
* deny - called when a plugin returns DENY, DENYSOFT or DENYDISCONNECT
* get\_mx (hmail, domain) - called by outbound to resolve the MX record
* deferred (hmail, params) - called when an outbound message is deferred
* bounce (hmail, err) - called when an outbound message bounces
* delivered (hmail, [host, ip, response, delay, port, mode, ok_recips, secured, authenticated]) - called when outbound mail is delivered
* send\_email (hmail) - called when outbound is about to be sent
* pre\_send\_trans\_email (fake_connection) - called just before an email is queued to disk with a faked connection object

### rcpt

The *rcpt* hook is slightly special.

When **connection.relaying == false** (the default, to avoid being an open relay), a rcpt plugin MUST return `next(OK)` or the sender will receive the error message "I cannot deliver for that user". The default *rcpt* plugin  is **rcpt_to.in_host_list**, which lists the domains for which to accept email.

After a *rcpt* plugin calls `next(OK)`, the *rcpt_ok* hook is run.

If a plugin prior to the *rcpt* hook sets **connection.relaying = true**, then it is not necessary for a rcpt plugin to call `next(OK)`.

### connect_init

The `connect_init` hook is unique in that all return codes are ignored. This is so that plugins that need to do initialization for every connection can be assured they will run. Return values are ignored.

### hook_init_http (next, Server)

If http listeners are are enabled in http.ini and the express module loaded, the express library will be located at Server.http.express. More importantly, the express [app / instance](http://expressjs.com/4x/api.html#app) will be located at Server.http.app. Plugins can register routes on the app just as they would with any [Express.js](http://expressjs.com/) app.

### hook_init_wss (next, Server)

If express loaded, an attempt is made to load [ws](https://www.npmjs.com/package/ws), the websocket server. If it succeeds, the wss server will be located at Server.http.wss. Because of how websockets work, only one websocket plugin will work at a time. One plugin using wss is [watch](https://github.com/haraka/Haraka/tree/master/plugins/watch).

### pre\_send\_trans\_email (next, fake_connection)

The `fake` connection here is a holder for a new transaction object. It only has the log methods and a `transaction` property
so don't expect it to behave like a a real connection object. This hook is designed so you can add headers and modify mails
sent via `outbound.send_email()`, see the dkim_sign plugin for an example.

## Hook Order

The ordering of hooks is determined by the SMTP protocol. Knowledge of [RFC 5321](http://tools.ietf.org/html/rfc5321) is beneficial.

##### Typical Inbound Connection

- hook_connect_init
- hook_lookup_rdns
- hook_connect
- hook_helo **OR** hook_ehlo (EHLO is sent when ESMTP is desired which allows extensions
such as STARTTLS, AUTH, SIZE etc.)
    - hook_helo
    - hook_ehlo
      - hook_capabilities
      - *hook_unrecognized_command* is run for each ESMTP extension the client requests
e.g. STARTTLS, AUTH etc.)
  - hook_mail
  - hook_rcpt (once per-recipient)
  - hook_rcpt_ok (for every recipient that hook_rcpt returned `next(OK)` for)
  - hook_data
  - *[attachment hooks]*
  - hook_data_post
  - hook_queue **OR** hook_queue_outbound
  - hook_queue_ok (called if hook_queue or hook_queue_outbound returns `next(OK)`)
- hook_quit **OR** hook_rset **OR** hook_helo **OR** hook_ehlo (after a message has been sent or rejected, the client can disconnect or start a new transaction with RSET, EHLO or HELO)
  - hook_reset_transaction
- hook_disconnect

##### Typical Outbound mail

By 'outbound' we mean messages using Haraka's built-in queue and delivery
mechanism. The Outbound queue is used when `connection.relaying = true` is set during the  transaction and `hook_queue_outbound` is called to queue the message.

The Outbound hook ordering mirrors the Inbound hook order above until after `hook_queue_outbound`, which is followed by:

- hook_send_email
- hook_get_mx
- at least one of:
  - hook_delivered  (once per delivery domain with at least one successful recipient)
  - hook_deferred  (once per delivery domain where at least one recipient or connection was deferred)
  - hook_bounce  (once per delivery domain where the recipient(s) or message was rejected by the destination)

## Plugin Run Order

Plugins are run on each hook in the order that they are specified in `config/plugins`. When a plugin returns anything other than `next()` on a hook, all subsequent plugins due to run on that hook are skipped (exceptions: connect_init, disconnect).

This is important as some plugins might rely on `results` or `notes` that have been set by plugins that need to run before them. This should be noted in the plugins documentation. Make sure to read it.

If you are writing a complex plugin, you may have to split it into multiple plugins to run in a specific order e.g. you want hook_deny to run last after all other plugins and hook_lookup_rdns to run first, then you can explicitly register your hooks and provide a `priority` value which is an integer between -100 (highest priority) to 100 (lowest priority) which defaults to 0 (zero) if not supplied.  You can apply a priority to your hook in the following way:

```js
exports.register = function () {
    this.register_hook('connect',  'do_connect_stuff', -100);
}
```

This would ensure that your `do_connect_stuff` function will run before any other
plugins registered on the `connect` hook, regardless of the order it was
specified in `config/plugins`.

Check the order that the plugins will run on each hook by running:

`haraka -o -c /path/to/config`

## Skipping Plugins

Plugins can be skipped at runtime by pushing the name of the plugin into the `skip_plugins` array in `transaction.notes`.  This array is reset for every transaction and once a plugin is added to the list, it will not run any hooks in that plugin for the remainder of the transaction.  For example, one could create a whitelist plugin that skipped `spamassassin` if the sender was in a whitelist.

## Logging

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

## Sharing State

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

All of these notes are JS objects - use them as simple key/value store e.g.

    connection.transaction.notes.test = 'testing';

## Plugins as Modules

Plugins as NPM modules are named with the `haraka-plugin` prefix. Therefore, a
plugin that frobnobricates might be called `haraka-plugin-frobnobricate` and
published to NPM with that name. The prefix is not required in the
`config/plugins` file.

Plugins loaded as NPM modules behave slightly different than plugins loaded
as plain JS files.

Plain JS plugins have a custom `require()` which allows loading core Haraka
modules via specifying `require('./name')` (note the `./` prefix). Although
the core modules aren't in the same folder, the custom `require` intercepts
this and look for core modules. Note that if there is a module in your plugins
folder of the same name that will not take preference, so avoid using names
similar to core modules.

Plugins loaded as modules do not have the special `require()`. To load
a core Haraka module you must use `this.haraka_require('name')`.
This should also be preferred for plain JS plugins, as the
`./` hack is likely to be removed in the future.

Plugins loaded as modules are not compiled in the Haraka plugin sandbox,
which blocks access to certain globals and provides a global `server` object.
To access the `server` object, use `connection.server` instead.

Module plugins support default config in their local `config` directory. See the
"Default Config and Overrides" section in [Config](Config.md).

## Shutdown

On graceful reload, Haraka will call a plugin's `shutdown` method.

This is so you can clear any timers or intervals, or shut down any connections
to remote servers. See [Issue 2024](https://github.com/haraka/Haraka/issues/2024).

e.g.

```js
exports.shutdown = function () {
    clearInterval(this._interval);
}
```

If you don't implement this in your plugin and have a connection open or a
timer running then Haraka will take 30 seconds to shut down and have to
forcibly kill your process.

Note: This only applies when running with a `nodes=...` value in smtp.ini.

## See also, [Results](Results.md)


Further Reading
--------------

Read about the [Connection](Connection.md) object.

Outbound hooks are [also documented](Outbound.md).
