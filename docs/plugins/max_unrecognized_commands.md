max\_unrecognized\_commands
=========================

This plugin places a maximum limit on the number of unrecognized commands
allowed before recognising that the connection is bad.

If the limit is reached the connecting client is sent an error message and
immediately (and rudely - technically an RFC violation) disconnected.

**IMPORTANT**: 
This plugin should be listed near the bottom of `config/plugins` so that it
runs after any plugins that use the unrecognized_command hook to implement
other SMTP verbs and extensions (such as the auth/* plugins), otherwise
commands valid for these plugins will be counted as unknown by this plugin.

Configuration
-------------

* max\_unrecognized\_commands

  Specifies the number of unrecognized commands to allow before disconnecting.
  Default: 10.
