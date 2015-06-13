clamd
=====

This plug-in implements Anti-Virus scanning with ClamAV using the **clamd**
daemon.

The plug-in will reject any message that ClamAV considers to be a virus.
If an error occurs (e.g. clamd not running or a timeout), the
message will be deferred with a temporary failure.

## Configuration

The following options can be defined in clamd.ini;

### clamd\_socket (default: localhost:3310)

  N.N.N.N:port, [ipv6::literal]:port, host:port or /path/to/socket of
  the clamd daemon.

  Multiple hosts can be listed separated by comma, semi-colon or spaces.

  If :port is omitted it defaults to 3310.

  On connection error or timeout the next host in the list will be tried.
  When the host list is exhausted, the message will be deferred with
  a temporary failure.


### randomize\_host\_order (default: false)

  If this is set then the list of hosts with be randomized before a
  connection is attempted.


### only\_with\_attachments                         (default: false)

  Set this option to only scan messages that contain non-textual
  attachments.  This is a performance optimization, however it will
  prevent ClamAV from detecting threats such as Phishing in plain-text
  or HTML messages.


### connect\_timeout                               (default: 10)

  Timeout connection to host after this many seconds.  A timeout will
  cause the next host in the list to be tried.  Once all hosts have
  been tried then a temporary failure will be returned.


### timeout                                       (default: 30)

  Post-connection timeout if there is no activity on the socket after
  this many seconds.  A timeout will cause the message to be rejected
  with a tempoary failure.


### max\_size                                      (default: 26214400)

  The maximum size of message that should be sent to clamd in bytes.
  This option should not be larger than the StreamMaxLength value in
  clamd.conf as clamd will stop scanning once this limit is reached.
  If the clamd limit is reached the plug-in will log a notice that
  this has happened and will allow the message though.

### [reject]

An optional reject section can offer control over when to reject connections.
The default settings are shown. ClamAV recommends that hits coming from 
SafeBrowsing / Phishing / Heuristics, Potentially Unwanted Applications, and
UNOFFICIAL be used only for scoring.

    * virus=true
    * error=true

The following reject options are disabled by default in clamd.conf. With a
default ClamAV install, these will have no effect. When an admin enables in
clamd.conf, Haraka with then, by default, reject such messages. Adjust these
settings to suit.

    * Broken.Executable=true
    * Structured=true
    * Encrypted=true
    * PUA=true
    * OLE2=true
    * Safebrowsing=true
    * UNOFFICIAL=true

The following options are enabled by default in clamd but ClamAV suggests
using them only for scoring.

    * Phishing=false

## clamd.excludes

  This file can contain a list of virus name patterns that when matched, are
  not rejected by this plugin. An X-Haraka-Virus: header will be inserted
  containing the virus name. This header can then be used for scoring
  in other plugins.

  The format of the file is one pattern per line. Comments are prefixed
  with #. Matches are case-insensitive.

  Patterns are expressed using wildcards (e.g. * and ?) or
  via regexp by enclosing the pattern in //.

  To negate a match (e.g. reject if it matches), prefix the match with !.
  Negative matches are always tested fist.

  Example:

`````
# Always reject test signatures
!*.TestSig_*
# Skip all unofficial signatures
*.UNOFFICIAL
# Phishing
Heuristics.Phishing.*
`````

