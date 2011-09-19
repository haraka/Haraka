clamdscan
=========

This plug-in implements basic Anti-Virus scanning with ClamAV.

It requires the *clamdscan* binary to be present in the path of the user
that is running Haraka and the *clamd* daemon must be running.

The plug-in will reject any message that ClamAV considers to be a virus.
If an error occurs (e.g. clamd not running or a timeout occurs) then the 
message will be rejected with a temporary failure.  

As this plug-in forks a child process for each message it is not suitable
for high message volumes, use the clamd plug-in for this instead.

Configuration
-------------

* clamdscan_bin                                 (default: clamdscan)

  Set this to the full path of the clamdscan binary.  If the user running
  Haraka has clamdscan in their path, then setting this is unnecessary.
  If the binary cannot be found then the plug-in will reject all messages
  with a temporary failure.

* only_with_attachment                          (default: 0)

  Set this option to only scan messages that contain non-textual 
  attachments.  This is a performance optimization, however it will
  prevent ClamAV from detecting threats such as Phishing in plain-text
  or HTML messages.

* timeout                                       (default: 30)

  Timeout the plug-in after this many seconds.  A timeout will cause
  the message to be rejected with a temporary failure.
