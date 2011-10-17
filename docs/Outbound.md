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

Outbound Configuration Files
----------------------------

### outbound.concurrency_max

Default: 100. Specifies the maximum concurrent connections to make. Note that
if using cluster (multiple CPUs) then this will be multiplied by the number
of CPUs that you have.

### outbound.enable_tls

Default: 0. Put a "1" in this file to enable TLS for outbound mail when the
remote end is capable of receiving TLS connections.

This uses the same `tls_key.pem` and `tls_cert.pem` files that the `tls`
plugin uses. See the plugin documentation for information on generating those
files.

### outbound.bounce_message

See "Bounce Messages" below for details.

### outbound.disabled

Allows you to temporarily disable outbound delivery, while still able to
receive and queue emails. This can be done while Haraka is running due to
how Haraka watches for config file changes.

Outbound Mail Hooks
-------------------

### The queue_outbound hook

The first hook that is called prior to queueing an outbound mail is the
`queue_outbound` hook. Only if all these hooks return `CONT` (or if there are
no hooks) will the mail be queued for outbound delivery. A return of `OK` will
indicate that the mail has been queued in some custom manner for outbound
delivery. Any of the `DENY` return codes will cause the message to be
appropriately rejected.

### The get_mx hook

Upon starting delivery the `get_mx` hook is called, with the parameter set to
the domain in question (for example a mail to `user@example.com` will call the
`get_mx` hook with `(next, hmail, domain)` as parameters). This is to allow
you to implement a custom handler to find MX records. For most installations
there is no reason to implement this hook - Haraka will find the correct MX
records for you.

### The bounce hook

If the mail completely bounces then the `bounce` hook is called. This is *not*
called if the mail is issued a temporary failure (a 4xx error code). The hook
parameter is the error message received from the remote end. If you do not wish
to have a bounce message sent to the originating sender of the email then you
can return `OK` from this hook to stop it from sending a bounce message.

### The delivered hook

When mails are successfully delivered to the remote end then the `delivered`
hook is called. The return codes from this hook have no effect, so it is only
useful for logging the fact that a successful delivery occurred.

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

