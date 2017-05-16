Outbound Mail with Haraka
=========================

A default installation of Haraka will queue outbound mail for delivery in the
queue directory. Those mails will be delivered to the appropriate MX record
for that domain. Mails are queued onto your disk, and will deal appropriately
with temporary failures to retry delivery later.

Outbound mails are defined as those that have set the `connection.relaying`
flag to `true` via a plugin. The simplest way of doing that is to use SMTP
AUTH, and have the client authenticate. For example using the `auth/flat_file`
plugin. However it is very simple to write a custom plugin to do this.

For statistics on outbound mail use the `process_title` plugin. See the
documentation for that plugin for details.

To flush the outbound queue (for temporary failed mails) hit the Haraka master
process with the SIGHUP signal (via the `kill` command line tool).

Outbound Configuration Files
----------------------------

### outbound.ini

* `disabled`

Default: false. Allows one to temporarily disable outbound delivery, while
still receiving and queuing emails. This can be changed while Haraka is
running.

* `concurrency_max`

Default: 100. Specifies the maximum concurrent connections to make. Note that
if using cluster (multiple CPUs) then this will be multiplied by the number
of CPUs that you have.

* `enable_tls`

Default: false. Switch to true to enable TLS for outbound mail when the
remote end is capable.

This uses the same `tls_key.pem` and `tls_cert.pem` files that the `tls`
plugin uses, along with other values in `tls.ini`. See the [tls plugin
docs](http://haraka.github.io/manual/plugins/tls.html) for information on generating those
files.

Within `tls.ini` you can specify global options for the values `ciphers`,
`requestCert` and `rejectUnauthorized`, alternatively you can provide
separate values by putting them under a key: `[outbound]`, such as:

```
[outbound]
ciphers=!DES
```

* `ipv6_enabled`

When this has a "true" value inside (usually a `1`), it defaults to an 'AAAA'
lookup first for each MX record, and uses those hosts to send email via.

* `always_split`

Default: false. By default, Haraka groups message recipients by domain so that
messages with multiple recipients at the same domain get sent in a single SMTP
session. When `always_split` is enabled, each recipient gets a queue entry and
delivery in its own SMTP session. This carries a performance penalty but
enables more flexibility in mail delivery and bounce handling.

* `received_header`

Default: "Haraka outbound". This text is attached as a `Received` header to
all outbound mail just before it is queued.

* `connect_timeout`

Timeout for connecting to remote servers. Default: 30s

* `pool_timeout`

Outbound mail uses "pooled" connections. An unused pool connection will send
a QUIT after this time. Default: 50s

Pooled connections means that a mail to a particular IP address will hold that
connection open and use it the next time it is requested. This helps with
large scale outbound mail. If you don't send lots of mail it is advised to
lower the `pool_timeout` value since it may upset receiving mail servers.

Setting this value to `0` will effectively disable the use of pools. You may
wish to set this if you have a `get_mx` hook that picks outbound servers on
a per-email basis (rather than per-domain).

* `pool_concurrency_max`

Set this to `0` to completely disable the pooling code.

This value determines how many concurrent connections can be made to a single
IP address (destination) in the pool. Default: 10 connections.

### outbound.bounce\_message

See "Bounce Messages" below for details.

The HMail Object
----------------

Many hooks (see below) pass in a `hmail` object.

You likely won't ever need to call methods on this object, so they are left
undocumented here.

The attributes of an `hmail` object that may be of use are:

* path - the full path to the queue file
* filename - the filename within the queue dir
* num_failures - the number of times this mail has been temp failed
* notes - notes you can store on a hmail object (similar to `transaction.notes`)
  to allow you to pass information between outbound hooks
* todo - see below

The ToDo Object
---------------

The `todo` object contains information about how to deliver this mail. Keys
you may be interested in are:

* rcpt_to - an Array of Address objects - the rfc.2821 recipients of this mail
* mail_from - an Address object - the rfc.2821 sender of this mail
* domain - the domain this mail is going to (see `always_split` above)
* notes - the original transaction.notes for this mail, also contains the
  following useful keys:
** outbound_ip - the IP address to bind to (note do not set this manually,
  use the `get_mx` hook)
** outbound_helo - the EHLO domain to use (again, do not set manually)
* queue_time - the epoch milliseconds time when this mail was queued
* uuid - the original transaction.uuid

Outbound Mail Hooks
-------------------

### The queue\_outbound hook

The first hook that is called prior to queueing an outbound mail is the
`queue_outbound` hook. Only if all these hooks return `CONT` (or if there are
no hooks) will the mail be queued for outbound delivery. A return of `OK` will
indicate that the mail has been queued in some custom manner for outbound
delivery. Any of the `DENY` return codes will cause the message to be
appropriately rejected.

### The send\_email hook

Parameters: `next, hmail`

Called just as the email is about to be sent.

Respond with `next(DELAY, delay_seconds)` to defer sending the email at this time.

### The get\_mx hook

Parameters: `next, hmail, domain`

Upon starting delivery the `get_mx` hook is called, with the parameter set to
the domain in question (for example a mail to `user@example.com` will call the
`get_mx` hook with `(next, hmail, domain)` as parameters). This is to allow
you to implement a custom handler to find MX records. For most installations
there is no reason to implement this hook - Haraka will find the correct MX
records for you.

The MX record is sent via next(OK, mx) and can be one of:

* A string of one of the following formats:
    * hostname
    * hostname:port
    * ipaddress
    * ipaddress:port
* An MX object of the form: `{priority: 0, exchange: hostname}` with the 
following optional properies:
       * `port` to specify an alternate port
       * `bind` to specify an outbound IP address to bind to
       * `bind_helo` to specify an outbound helo for IP address to bind to
       * `using_lmtp` boolean to specify that delivery should be attempted using 
          LMTP instead of SMTP.
       *  `auth_user` to specify an AUTH username (required if AUTH is desired)
       *  `auth_pass` to specify an AUTH password (required if AUTH is desired)
       *  `auth_type` to specify an AUTH type that should be used with the MX.
If this is not specified then Haraka will pick an appropriate method.
* A list of MX objects in an array, each in the same format as above.

### The deferred hook

Parameters: `next, hmail, {delay: ..., err: ...}`

If the mail is temporarily deferred, the `deferred` hook is called. The hook
parameter is an object with keys: `delay` and `err`, which explain the delay
(in seconds) and error message.

If you want to stop at this point, and drop the mail completely, then you
can call `next(OK)`.

If you want to change the delay, then call `next(DENYSOFT, delay_in_seconds)`.
Using this you can define a custom delay algorithm indexed by
`hmail.num_failures`.

### The bounce hook

Parameters: `next, hmail, error`

If the mail completely bounces then the `bounce` hook is called. This is *not*
called if the mail is issued a temporary failure (a 4xx error code). The hook
parameter is the error message received from the remote end as an `Error` object.
The object may also have the following properties:

* mx - the MX object that caused the bounce
* deferred_rcpt - the deferred recipients that eventually bounced
* bounced_rcpt - the bounced recipients

If you do not wish to have a bounce message sent to the originating sender of the
email then you can return `OK` from this hook to stop it from sending a bounce message.

### The delivered hook

Parameters: `next, hmail, params`

Params is a list of: `[host, ip, response, delay, port, mode, ok_recips, secured]`

When mails are successfully delivered to the remote end then the `delivered`
hook is called. The return codes from this hook have no effect, so it is only
useful for logging the fact that a successful delivery occurred.
 
* `host` - Hostname of the MX that the message was delivered to,
* `ip` - IP address of the host that the message was delivered to,
* `response` - Variable contains the SMTP response text returned by the host 
that received the message and will typically contain the remote queue ID and
* `delay` - Time taken between the queue file being created and the 
message being delivered.
* `port` - Port number that the message was delivered to.
* `mode` - Shows whether SMTP or LMTP was used to deliver the mail.
* `ok_recips` - an Address array containing all of the recipients that were
successfully delivered to.
* `secured` - A boolean denoting if the connection used TLS or not.

Outbound IP address
-------------------

Normally the OS will decide which IP address will be used for outbound 
connections using the IP routing table.  

There are instances where you may want to separate outbound traffic on 
different IP addresses based on sender, domain or some other identifier.  
To do this, the IP address that you want to use *must* be bound to an 
interface (or alias) on the local system.

As described above the outbound IP can be set using the `bind` parameter
and also the outbound helo for the IP can be set using the `bind_ehlo` 
parameter returned my the `get_mx` hook or during the reception of the message 
you can set a transaction note in a plugin to tell Haraka which outbound IP 
address you would like it to use when it tries to deliver the message:

`````
connection.transaction.notes.outbound_ip = '1.2.3.4';
connection.transaction.notes.outbound_helo = 'mail-2.example.com';
`````

Note: if the `get_mx` hook returns a `bind` and `bind_helo` parameter, then
this will be used in preference to the transaction note.

AUTH
----

If you wish to use AUTH for a particular domain or domains, or you wish to
force all mail to an outbound service or smart host that requires authentication
then you can use the `get_mx` hook documented above to do this by supplying
both `auth_user` and `auth_pass` properties in an MX object.

If AUTH properties are supplied and the remote end does not offer AUTH or there
are no compatible AUTH methods, then the message with be sent without AUTH and
a warning will be logged.


Bounce Messages
---------------

The contents of the bounce message are configured by a file called
`config/outbound.bounce_message`. If you look at this file you will see it
contains several template entries wrapped in curly brackets. These will be
populated as follows:

* pid - the current process id
* date - the current date when the bounce occurred
* me - the contents of `config/me`
* from - the originating sender of the message
* msgid - a uuid for the mail
* to - the end recipient of the message, or the first recipient if it was to
multiple people
* reason - the text from the remote server indicating why it bounced

Following the bounce message itself will be a copy of the entire original
message.

Creating a mail internally for outbound delivery
------------------------------------------------

Sometimes it is necessary to generate a new mail from within a plugin.

To do that, you can use the `outbound` module directly:

    var outbound = require('./outbound');
    
    var plugin = this;
    
    var to = 'user@example.com';
    var from = 'sender@example.com';
    
    var contents = [
        "From: " + from,
        "To: " + to,
        "MIME-Version: 1.0",
        "Content-type: text/plain; charset=us-ascii",
        "Subject: Some subject here",
        "",
        "Some email body here",
        ""].join("\n");
        
    var outnext = function (code, msg) {
        switch (code) {
            case DENY:  plugin.logerror("Sending mail failed: " + msg);
                        break;
            case OK:    plugin.loginfo("mail sent");
                        next();
                        break;
            default:    plugin.logerror("Unrecognized return code from sending email: " + msg);
                        next();
        }
    };
    
    outbound.send_email(from, to, contents, outnext);

The callback on `send_email()` is passed `OK` if the mail is successfully
queued to disk, not when it is successfully delivered. To check delivery
status you still need to hook `delivered` and `bounce` to know if it was
successfully delivered.

The callback parameter may be omitted if you don't need to handle errors
should queueing to disk fail e.g:

    outbound.send_email(from, to, contents);


In case you are passing your content dot-stuffed (a dot at the start of a line
is doubled, like it is in SMTP conversation, 
see https://tools.ietf.org/html/rfc2821#section-4.5.2), you should pass the
```dot_stuffed: true``` option, like so:
    
    outbound.send_email(from, to, contents, outnext, { dot_stuffed: true });


In case you need notes in the new transaction that `send_email()` creates, you should pass the
```notes``` option, like so:

    outbound.send_email(from, to, contents, outnext, { notes: transaction.notes });
