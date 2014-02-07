max\_unrecognized\_commands
=========================

This plugin places a maximum limit on the number of unrecognized commands
allowed before recognising that the connection is bad.

If the limit is reached the connecting client is sent an error message and
immediately (and rudely - technically an RFC violation) disconnected.

Configuration
-------------

* max\_unrecognized\_commands

  Specifies the number of unrecognised commands to allow before disconnecting.
  Default: 10.
