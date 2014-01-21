early\_talker
============

Early talkers are violators of the SMTP specification, which demands that
clients must wait for responses before sending the next command.

Early talker detection is handled internally by Haraka (in connection.js).

At the DATA command, this plugin checks to see if an early talker was
detected.

Any plugin can detect early talkers by checking connection.early\_talker.

Configuration
-------------

* early\_talker.pause

  Specifies a delay in milliseconds to delay before each SMTP command before
  sending the response, while waiting for early talkers. Default is no pause.
