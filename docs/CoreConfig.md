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
  * ignore_bad_plugins - If a plugin fails to compile by default Haraka will stop at load time.
    If, however, you wish to continue on without that plugin's facilities, then
    set this config option

[1]: http://learnboost.github.com/cluster/

* me

  A name to use for this server. Used in received lines and elsewhere. Setup
  by default to be your hostname.

* early\_talker\_delay

  If clients talk early we *punish* them with a delay of this many milliseconds
  default: 1000.

* plugin\_timeout

  Seconds to allow a plugin to run before the next hook is called automatically
  default: 30

* cluster\_modules

  A list of cluster modules to load. Use colons to separate parameters to be
  passed to the module/plugin. Typical example:

    repl:8888
    stats

  The above allows you to get stats on your setup via the repl on port 8888.

* smtpgreeting

  The greeting line used when a client connects. This can be multiple lines
  if required (this may cause some connecting machines to fail - though
  usually only spam-bots).

* max_received_count

  The maximum number of "Received" headers allowed in an email. This is a
  simple protection against mail loops. Defaults to 100.

* outbound.concurrency_max

  Maximum concurrency to use when delivering mails outbound. Defaults to 100.

* outbound.disabled

  Put a `1` in this file to temporarily disable outbound delivery. Useful to
  do while you're figuring out network issues, or just testing things.

* outbound.bounce_message

  The bounce message should delivery of the mail fail. See the source of. The
  default is normally fine. Bounce messages contain a number of template
  replacement values which are best discovered by looking at the source code.
