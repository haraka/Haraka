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
        // they passed the connection and helo checks
    }
     
    var ar = connection.transaction.results.get('access');
    if (ar.pass.length > 2) {
        // they passed the mail and rcpt checks
    }

To determine which file(s) had matching entries, inspect the contents
of the pass/fail elements in the result object.

## Config Files

### access.ini

Each check can be enabled or disabled in the [check] section:

    [check]
    any=true    (see below)
    conn=false
    helo=false
    mail=false
    rcpt=false

A custom deny message can be configured for each SMTP phase:

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

#### ANY

The **any** test is very different than the others. The any blacklist matches
only on the domain name and it applies to the rDNS hostname, the HELO
hostname, the MAIL FROM domain name, and the RCPT TO domain name.

**Any** is based on the idea that I want to block the offending domain name
no matter where in the SMTP conversation it appears. That's possible using
several regex lists in the per-phase checks, but it's much slower.

How much slower? First I tested indexOf -vs- precompiled regex. In
a list of 3, where the matches are at the front of the list, regex
matches are 2x as slow. When the list grows to 30 entries, the regex
matches are 3x times as slow. When the matches are moved to the end of the
30 member list, the regex searches are over 100x slower than indexOf.

Rather than putting a regex in several files to block it everywhere, with
**any** we just drop the domain name into the access.domain file and it
gets checked everywhere.

The whitelist enries are in the same file. They are prepended with an
exclamation mark (!). To block anything from example.com but not
special.example.com:

    example.com
    !special.example.com

To block everything from aol.com, except messages from that one person you
know that still uses AOL:

    aol.com
    !friend@aol.com
