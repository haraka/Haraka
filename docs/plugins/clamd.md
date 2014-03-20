clamd
=====

This plug-in implements Anti-Virus scanning with ClamAV using the *clamd*
daemon.

The plug-in will reject any message that ClamAV considers to be a virus.
If an error occurs (e.g. clamd not running or a timeout occurs) then the 
message will be rejected with a temporary failure.  

Configuration
-------------

### clamd.ini

* clamd\_socket                                  (default: localhost:3310)

  ip.ip.ip.ip:port, [ipv6::literal]:port, host:port or /path/to/socket of
  the clamd daemon to send the message to for scanning.

  Multiple hosts can be listed separated by comma, semi-colon or spaces.

  If :port is omitted it defaults to 3310.

  On connection error or timeout the next host in the list will be tried
  and when the host list is exhausted, the message will be rejected with 
  a temporary failure.


* randomize\_host\_order                          (default: false)

  If this is set then the list of hosts with be randomized before a 
  connection is attempted.


* only\_with\_attachments                         (default: false)

  Set this option to only scan messages that contain non-textual 
  attachments.  This is a performance optimization, however it will
  prevent ClamAV from detecting threats such as Phishing in plain-text
  or HTML messages.


* connect\_timeout                               (default: 10)

  Timeout connection to host after this many seconds.  A timeout will
  cause the next host in the list to be tried.  Once all hosts have 
  been tried then a temporary failure will be returned.


* timeout                                       (default: 30)

  Post-connection timeout if there is no activity on the socket after
  this many seconds.  A timeout will cause the message to be rejected
  with a tempoary failure.


* max\_size                                      (default: 26214400)

  The maximum size of message that should be sent to clamd in bytes.
  This option should not be larger than the StreamMaxLength value in
  clamd.conf as clamd will stop scanning once this limit is reached.
  If the clamd limit is reached the plug-in will log a notice that
  this has happened and will allow the message though.


### clamd.excludes

  This file can optionally contain a list of virus name patterns
  that if matches, cause the plugin not to reject the message but
  instead to insert a X-Haraka-Virus: header containing the virus
  name.  This header can then be used for scoring in another plugin.

  The format of the file is simple - one pattern per line and 
  comments can be used by prefixing the line with #.  Matches are
  always case-insensitive.

  Patterns may be expressed using wildcards (e.g. * and ?) or 
  via regexp by enclosing the regexp in //.

  If you want to negate a match (e.g. reject if it matches) then
  prefix the match with !.  Negative matches are always tested 
  fist.

  Example:

  `````
# Always reject test signatures
!*.TestSig_*
# Skip all unofficial signatures
*.UNOFFICIAL
# Phishing
Heuristics.Phishing.*
  `````
