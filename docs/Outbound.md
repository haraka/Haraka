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
plugin uses. See the [tls plugin
docs](http://haraka.github.io/manual/plugins/tls.html) for information on generating those
files.

* `ipv6_enabled`

When this has a "true" value inside (usually a `1`), it defaults to an 'AAAA'
lookup first for each MX record, and uses those hosts to send email via.

* `always_split`

Default: false. By default, Haraka groups message recipients by domain so that
messages with multiple recipients at the same domain get sent in a single SMTP
session. When `always_split` is enabled, each recipient gets a queue entry and
delivery in its own SMTP session. This carries a performance penalty but
enables more flexibility in mail delivery and bounce handling.

### outbound.bounce\_message

See "Bounce Messages" below for details.

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
* An MX object of the form: `{priority: 0, exchange: hostname}` and optionally
a `port` value to specify an alternate port, and a `bind` value to specify an
outbound IP address to bind to and a `using_lmtp` boolean to specify that
delivery should be attempted using LMTP instead of SMTP.
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
            default:    plugin.logerror("Unrecognised return code from sending email: " + msg);
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

    outbound.send_email(form, to, contents);
