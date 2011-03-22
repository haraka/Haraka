Core Configuration Files
========================

The Haraka core reads some configuration files to determine a few actions:

* loglevel

  Can contain either a number or a string. See the top of logger.js for the
different levels available.

* databytes

  Contains the maximum SIZE of an email that Haraka will receive.

* plugins

  The list of plugins to load

* smtp.ini

  Keys:
  
  * port - the port to use (default: 25)
  * listen\_address - default: 0.0.0.0 (i.e. all addresses)
  * inactivity\_time - how long to let clients idle in seconds (default: 300)
  * nodes - if [multi-node.js][1] is available in the Haraka dir, specifies how
    many processes to fork off. Can be the string "cpus" to fork off as many
    children as there are CPUs (default: 0)
  * user - optionally a user to drop privileges to. Can be a string or UID.

[1]: https://github.com/kriszyp/multi-node/blob/master/lib/multi-node.js

* me

  A name to use for this server. Used in received lines and elsewhere.

* early\_talker\_delay

  If clients talk early we *punish* them with a delay of this many milliseconds
  default: 1000.

* plugin_timeout

  Seconds to allow a plugin to run before the next hook is called automatically
  default: 30
