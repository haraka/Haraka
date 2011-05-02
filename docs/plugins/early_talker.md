early_talker
============

This plugin checks for early talkers. These are violators of the SMTP
specification, which demands that clients must wait for responses before
sending the next command.

This plugin checks for early talkers at the DATA command.

Configuration
-------------

* early_talker.pause

  Specifies a delay in milliseconds to delay at the DATA command before
  sending the response, while waiting for early talkers. Default is no pause.