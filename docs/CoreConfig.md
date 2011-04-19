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
  * nodes - if [cluster][1] is available, specifies how
    many processes to fork off. Can be the string "cpus" to fork off as many
    children as there are CPUs (default: 0, which disables cluster mode)
  * user - optionally a user to drop privileges to. Can be a string or UID.

[1]: http://learnboost.github.com/cluster/

* me

  A name to use for this server. Used in received lines and elsewhere.

* early\_talker\_delay

  If clients talk early we *punish* them with a delay of this many milliseconds
  default: 1000.

* plugin_timeout

  Seconds to allow a plugin to run before the next hook is called automatically
  default: 30

* cluster_modules

  A list of cluster modules to load. Use colons to separate parameters to be
  passed to the module/plugin. Typical example:

    repl:8888
    stats

  The above allows you to get stats on your setup via the repl on port 8888.
