# access

This plugin applies access lists during the connect, helo, mail, and rcpt
phases of the SMTP conversation. This modules provides an ACL for each phase.

The ACLs share a common file format and apply their tests in the same order:
if whitelisted, stop processing, and then apply the blacklist. The whitelist
is primarily to counter blacklist entries that match too much.

Entries in ACL files are one per line.

Regex entries are anchored, meaning '^' + regex + '$' are added automatically.
To bypass that, use a '.\*' at the start or the end of the regex. This should
help avoid overly permissive rules.

## Usage

To enable **access**, add an entry (access) to config/plugins. Then add
entries to the config files for the addresses or patterns to block.

### Checking ACL results

To check access results from other plugins, use the standard *results*
methods.

    var ar = connection.results.get('access');
    if (ar.pass.length > 2) {
        // they passed the connection and helo ACLs
    }
     
    var ar = connection.results.get('access');
    if (ar.pass.length > 2) {
        // they passed the mail and rcpt ACLs
    }

To determine which file(s) had matching entries, inspect the contents
of the pass/fail elements in the result object.

## Config Files

### access.ini

A custom deny message can be configured for the blacklist in each SMTP phase:

    [deny_msg]
    conn=You are not allowed to connect
    helo=That HELO is not allowed to connect
    mail=That sender cannot send mail here
    rcpt=That recipient is not allowed


### Connect

The connect ACLs are evaluated against the IP address **and** the rDNS
hostname (if any) of the remote.

* connect.rdns\_access.whitelist          (pass)
* connect.rdns\_access.whitelist\_regex   (pass)
* connect.rdns\_access.blacklist          (block)
* connect.rdns\_access.blacklist\_regex   (block)

### HELO/EHLO

* helo.checks.regexps                     (block)

### MAIL FROM

* connect.mail\_from.whitelist          (pass)
* connect.mail\_from.whitelist\_regex   (pass)
* connect.mail\_from.blacklist          (block)
* connect.mail\_from.blacklist\_regex   (block)

### RCPT TO

* connect.rcpt\_to.whitelist           (pass)
* connect.rcpt\_to.whitelist\_regex    (pass)
* connect.rcpt\_to.blacklist           (block)
* connect.rcpt\_to.blacklist\_regex    (block)

