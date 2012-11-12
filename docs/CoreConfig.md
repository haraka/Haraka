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
  * group - optionally a group to drop privileges to. Can be a string or GID.
  * ignore_bad_plugins - If a plugin fails to compile by default Haraka will stop at load time.
    If, however, you wish to continue on without that plugin's facilities, then
    set this config option
  * daemonize - enable this to cause Haraka to fork into the background on start-up (default: 0)
  * daemon_log_file - (default: /var/log/haraka.log) where to redirect stdout/stderr when daemonized
  * daemon_pid_file - (default: /var/run/haraka.pid) where to write a PID file to
  * spool_dir - (default: none) directory to create temporary spool files in
  * spool_after - (default: -1) if message exceeds this size in bytes, then spool the message to disk
    specify -1 to disable spooling completely or 0 to force all messages to be spooled to disk.

[1]: http://learnboost.github.com/cluster/ or node version >= 0.8

* me

  A name to use for this server. Used in received lines and elsewhere. Setup
  by default to be your hostname.

* deny_includes_uuid

  Each connection and mail in Haraka includes a UUID which is also in most log
  messages. If you put a `1` in this file then every denied mail (either via
  DENY/5xx or DENYSOFT/4xx return codes) will include the uuid at the start
  of each line of the deny message in brackets, making it easy to track
  problems back to the logs.

  Because UUIDs are long, if you put a number greater than 1 in the config
  file, it will be truncated to that length. We recommend a 6 as a good
  balance of finding in the logs and not making lines too long.

* banner_include_uuid

  This will add the full UUID to the first line of the SMTP greeting banner.

* early\_talker\_delay

  If clients talk early we *punish* them with a delay of this many milliseconds
  default: 1000.

* plugin\_timeout

  Seconds to allow a plugin to run before the next hook is called automatically
  default: 30

  Note also that each plugin can have a `config/&lt;plugin_name&gt;.timeout`
  file specifying a per-plugin timeout. In this file you can set a timeout
  of 0 to mean that this plugin's hooks never time out. Use this with care.

* cluster\_modules

  NOTE: this is only valid on node.js 0.4 using the LearnBoost cluster module
  it is not used on node.js 0.6 or later.

  A list of cluster modules to load. Use a colon to separate parameters to be
  passed to the module/plugin. Typical example:

    repl:8888
    stats: {"connections": true}

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

* haproxy_hosts

  A list of HAProxy hosts that Haraka should enable the PROXY protocol from.
  See HAProxy.md
