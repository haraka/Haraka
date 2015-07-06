early\_talker
============

Early talkers are violators of the SMTP specification, which demands that
clients must wait for certain responses before sending the next command.

Early talker detection is handled internally by Haraka (in connection.js).

This plugin introduces a configurable delay before the connection banner
is sent and after the DATA command is sent to allow the client to send 
data and for Haraka to detect if it talks early.

If an early talker is detected at connection or DATA, then a DENY is
returned with the message 'You talk too soon'.

Configuration
-------------

* early\_talker.pause

  Specifies a delay in milliseconds to delay before each SMTP command before
  sending the response, while waiting for early talkers. Default is no pause.
