# Outbound Mail with Haraka

A default installation of Haraka will queue outbound mail for delivery in the queue directory. Those mails will be delivered to the appropriate MX record for that domain. Mails are queued onto your disk, and will deal appropriately with temporary failures to retry delivery later.

Outbound mails are defined as those that have set the `connection.relaying` flag to `true` via a plugin. The simplest way of doing that is to use SMTP AUTH, and have the client authenticate. For example using the `auth/flat_file` plugin. The `relay` plugin provides common ways to set it and it is simple to write a custom plugin to do this.

For statistics on outbound mail use the `process_title` plugin. See the documentation for that plugin for details.

To flush the outbound queue (for temporary failed mails) hit the Haraka master process with the SIGHUP signal (via the `kill` command line tool).

## Outbound Configuration Files

### outbound.ini

* `disabled`

Default: false. Allows one to temporarily disable outbound delivery, while still receiving and queuing emails. This can be changed while Haraka is running.

* `concurrency_max`

Default: 100. Specifies the maximum concurrent connections to make. Note that if using cluster (multiple CPUs) this will be multiplied by the number of CPUs that you have.

* `enable_tls`

Default: true. Switch to false to disable TLS for outbound mail.

This uses the same `tls_key.pem` and `tls_cert.pem` files that the `TLS` plugin uses, along with other values in `tls.ini`. See the [TLS plugin docs][url-tls] for more information.

Within `tls.ini` you can specify global options for the values `ciphers`, `minVersion`, `requestCert` and `rejectUnauthorized`, alternatively you can provide separate values by putting them under a key: `[outbound]`, such as:

```ini
[outbound]
ciphers=!DES
```

* `always_split`

Default: false. By default, Haraka groups message recipients by domain so that messages with multiple recipients at the same domain get sent in a single SMTP session. When `always_split` is enabled, each recipient gets a queue entry and delivery in its own SMTP session. This carries a performance penalty but enables more flexibility in mail delivery and bounce handling.

* `received_header`

Default: "Haraka outbound". If this text is any string except *disabled*, the string is attached as a `Received` header to all outbound mail just before it is queued.

* `connect_timeout`

Timeout for connecting to remote servers. Default: 30s

* `local_mx_ok`

Default: false. By default, outbound to a local IP is disabled, to avoid creating mail loops. Set this to true if you want to allow outbound to local IPs. This could be useful if you want to deliver mail to private IPs or localhost on another port.

* `temp_fail_intervals`

Set this to specify the delay intervals to use between trying to re-send an email that has a temporary failure condition.  The setting is a comma separated list of time spans and multipliers.  The time span is a number followed by `s`, `m`, `h`, or `d` to represent seconds, minutes, hours, and days, respectively.  The multiplier is an asterisk followed by an integer representing the number of times to repeat the interval. For example, the entry `1m, 5m*2, 1h*3` results in an array of delay times of
`[60,300,300,3600,3600,3600]` in seconds.  The email will be bounced when the array runs out of intervals (the 7th failure in this case).  Set this to `none` to bounce the email on the first temporary failure.

### outbound.bounce\_message

See "Bounce Messages" below for details.

## The HMail Object

Many hooks (see below) pass in a `hmail` object.

You likely won't ever need to call methods on this object, so they are left undocumented here.

The attributes of an `hmail` object that may be of use are:

* path - the full path to the queue file
* filename - the filename within the queue dir
* num_failures - the number of times this mail has been temp failed
* notes - notes you can store on a hmail object (similar to `transaction.notes`) to allow you to pass information between outbound hooks
* todo - see below

## The ToDo Object

The `todo` object contains information about how to deliver this mail. Keys you may be interested in are:

* rcpt_to - an Array of `Address`<sup>[1](#fn1)</sup> objects - the rfc.2821 recipients of this mail
* mail_from - an Address<sup>[1](#fn1)</sup> object - the rfc.2821 sender of this mail
* domain - the domain this mail is going to (see `always_split` above)
* notes - the original transaction.notes for this mail, also contains the following useful keys:
  * outbound_ip - the IP address to bind to (do not set manually, use the `get_mx` hook)
  * outbound_helo - the EHLO domain to use (again, do not set manually)
* queue_time - the epoch milliseconds time when this mail was queued
* uuid - the original transaction.uuid
* force_tls - if true, this mail will be sent over TLS or defer

## Outbound Mail Hooks

### The queue\_outbound hook

The first hook that is called prior to queueing an outbound mail is the `queue_outbound` hook. Only if all these hooks return `CONT` (or if there are no hooks) will the mail be queued for outbound delivery. A return of `OK` will indicate that the mail has been queued in some custom manner for outbound delivery. Any of the `DENY` return codes will cause the message to be appropriately rejected.

### The send\_email hook

Parameters: `next, hmail`

Called just as the email is about to be sent.

Respond with `next(DELAY, delay_seconds)` to defer sending the email at this time.

### The get\_mx hook

Parameters: `next, hmail, domain`

Upon starting delivery the `get_mx` hook is called, with the parameter set to the domain in question (for example a mail to `user@example.com` will call the `get_mx` hook with `(next, hmail, domain)` as parameters). This is to allow you to implement a custom handler to find MX records. For most installations there is no reason to implement this hook - Haraka will find the MX records via DNS.

The MX is sent via next(OK, mx). `mx` is a [HarakaMx][url-harakamx] object, an array of HarakaMx objects, or any suitable HarakaMx input.

### The deferred hook

Parameters: `next, hmail, {delay: ..., err: ...}`

If the mail is temporarily deferred, the `deferred` hook is called. The hook parameter is an object with keys: `delay` and `err`, which explain the delay (in seconds) and error message.

If you want to stop at this point, and drop the mail completely, then you can call `next(OK)`.

If you want to change the delay, then call `next(DENYSOFT, delay_in_seconds)`. Using this you can define a custom delay algorithm indexed by `hmail.num_failures`.

### The bounce hook

Parameters: `next, hmail, error`

If the mail completely bounces then the `bounce` hook is called. This is *not* called if the mail is issued a temporary failure (a 4xx error code). The hook parameter is the error message received from the remote end as an `Error` object. The object may also have the following properties:

* mx - the MX object that caused the bounce
* deferred_rcpt - the deferred recipients that eventually bounced
* bounced_rcpt - the bounced recipients

If you do not wish to have a bounce message sent to the originating sender of the email then you can return `OK` from this hook to stop it from sending a bounce message.

### The delivered hook

Parameters: `next, hmail, params`

Params is a list of: `[host, ip, response, delay, port, mode, ok_recips, secured]`

When mails are successfully delivered to the remote end then the `delivered` hook is called. The return codes from this hook have no effect, so it is only useful for logging the fact that a successful delivery occurred.
 
* `host` - Hostname of the MX that the message was delivered to,
* `ip` - IP address of the host that the message was delivered to,
* `response` - Variable contains the SMTP response text returned by the host that received the message and will typically contain the remote queue ID and
* `delay` - Time taken between the queue file being created and the  message being delivered.
* `port` - Port number that the message was delivered to.
* `mode` - Shows whether SMTP or LMTP was used to deliver the mail.
* `ok_recips` - an `Address`<sup>[1](#fn1)</sup> array containing all of the recipients that were successfully delivered to.
* `secured` - A boolean denoting if the connection used TLS or not.

## Outbound IP address

Normally the OS will decide which IP address will be used for outbound  connections using the IP routing table.  

There are instances where you may want to separate outbound traffic on different IP addresses based on sender, domain or some other identifier. To do this, the IP address that you want to use *must* be bound to an interface (or alias) on the local system.

As described above, the outbound IP can be set using the `bind` parameter and also the outbound helo for the IP can be set using the `bind_ehlo` parameter returned by the `get_mx` hook.

## AUTH

If you wish to use AUTH for a particular domain or domains, or you wish to force all mail to an outbound service or smart host that requires authentication then you can use the `get_mx` hook documented above to do this by supplying both `auth_user` and `auth_pass` properties in an MX object.

If AUTH properties are supplied and the remote end does not offer AUTH or there are no compatible AUTH methods, then the message will be sent without AUTH and a warning will be logged.

## Bounce Messages

The contents of the bounce message are configured by a file called `config/outbound.bounce_message`. If you look at this file you will see it contains several template entries wrapped in curly brackets. These will be populated as follows:

Optional: Possibility to add HTML code (with optional image) to the bounce message is possible by adding the files `config/outbound.bounce_message_html`. An image can be attached to the mail by using `config/outbound.bounce_message_image`.

* pid - the current process id
* date - the current date when the bounce occurred
* me - the contents of `config/me`
* from - the originating sender of the message
* msgid - a uuid for the mail
* to - the end recipient of the message, or the first recipient if it was to
multiple people
* reason - the text from the remote server indicating why it bounced

Following the bounce message itself will be a copy of the entire original message.

## Creating a mail internally for outbound delivery

Sometimes it is necessary to generate a new mail from within a plugin.

To do that, you can use the `outbound` module directly:

```js
const outbound = require('./outbound');

const to = 'user@example.com';
const from = 'sender@example.com';

const contents = [
    "From: " + from,
    "To: " + to,
    "MIME-Version: 1.0",
    "Content-type: text/plain; charset=us-ascii",
    "Subject: Some subject here",
    "",
    "Some email body here",
    ""].join("\n");

const outnext = (code, msg) => {
    switch (code) {
        case DENY:  this.logerror("Sending mail failed: " + msg);
                    break;
        case OK:    this.loginfo("mail sent");
                    next();
                    break;
        default:    this.logerror("Unrecognized return code from sending email: " + msg);
                    next();
    }
}

outbound.send_email(from, to, contents, outnext)
```

The callback on `send_email()` is passed `OK` if the mail is successfully queued, not when it is successfully delivered. To check delivery status, you need to hook `delivered` and `bounce`.

The callback parameter may be omitted if you don't need to handle errors should queueing to disk fail e.g:

```js
outbound.send_email(from, to, contents);
```

Various options can be passed to `outbound.send_email` like so:

```js
outbound.send_email(from, to, contents, outnext, options);
```

Where `options` is a Object that may contain the following keys:

| Key/Value              | Description |
|------------------------|-------------|
| `dot_stuffed: true`    | Use this if you are passing your content dot-stuffed (a dot at the start of a line is doubled, like it is in SMTP conversation, see [RFC 2821][url-rfc2821].|
| `notes: { key: value}` | In case you need notes in the new transaction that `send_email()` creates. |
| `remove_msgid: true`   | Remove any Message-Id header found in the message.  If you are reading a message in from the filesystem and you want to ensure that a generated Message-Id header is used in preference over the original.  This is useful if you are releasing mail from a quarantine. |
| `remove_date: true`    | Remove any Date header found in the message.  If you are reading a message in from the filesystem and you want to ensure that a generated Date header is used in preference over the original.  This is useful if you are releasing mail from a quarantine. |
| `origin: Object`       | Adds object as argument to logger.log calls inside outbound.send_email. Useful for tracking which Plugin/Connection/HMailItem object generated email. | 


```js
outbound.send_email(from, to, contents, outnext, { notes: transaction.notes });
```

<a name="fn1">1</a>: `Address` objects are [address-rfc2821](https://github.com/haraka/node-address-rfc2821) objects.

[url-tls]: https://haraka.github.io/plugins/tls
[url-harakamx]: https://github.com/haraka/haraka-net-utils?tab=readme-ov-file#harakamx
[url-rfc2821]: https://tools.ietf.org/html/rfc2821#section-4.5.2