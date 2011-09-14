clamd
=====

This plug-in implements Anti-Virus scanning with ClamAV using the *clamd*
daemon.

The plug-in will reject any message that ClamAV considers to be a virus.
If an error occurs (e.g. clamd not running or a timeout occurs) then the 
message will be rejected with a temporary failure.  

Configuration
-------------

* clamd_socket                                  (default: localhost:3310)

  host:port or /path/to/socket of the clamd daemon to send the message to
  for scanning.  If :port is omitted it defaults to 3310.
  On connection error or timeout the message will be rejected with a
  temporary failure.

* only_with_attachment                          (default: 0)

  Set this option to only scan messages that contain non-textual 
  attachments.  This is a performance optimization, however it will
  prevent ClamAV from detecting threats such as Phishing in plain-text
  or HTML messages.

* timeout                                       (default: 60)

  Timeout the plug-in after this many seconds.  A timeout will cause
  the message to be rejected with a temporary failure.

* max_size                                      (default: 26214400)

  The maximum size of message that should be sent to clamd in bytes.
  This option should not be larger than the StreamMaxLength value in
  clamd.conf as clamd will stop scanning once this limit is reached.
  If the clamd limit is reached the plug-in will log a notice that
  this has happened and will allow the message though.
