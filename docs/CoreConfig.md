# Core Configuration Files

See [Logging](Logging.md).

The Haraka core reads some configuration files to determine a few actions:

- smtp.yaml or smtp.json

If either of these files exist then they are loaded first.
This file is designed to use the JSON/YAML file overrides documented in
[haraka-config](https://github.com/haraka/haraka-config) to optionally provide the entire configuration in a single file.

- plugins

The list of plugins to load

- smtp.ini

  Keys:

  - listen_host, port - the host and port to listen on (default: ::0 and 25)
  - listen - (default: [::0]:25) Comma separated IP:Port addresses to listen on
  - inactivity_time - how long to let clients idle in seconds (default: 300)
  - nodes - specifies how many processes to fork. The string "cpus" will fork as many children as there are CPUs (default: 1, which enables cluster mode with a single process)
  - user - optionally a user to drop privileges to. Can be a string or UID.
  - group - optionally a group to drop privileges to. Can be a string or GID.
  - ignore_bad_plugins - If a plugin fails to compile by default Haraka will stop at load time.
    If, however, you wish to continue on without that plugin's facilities, then
    set this config option
  - daemonize - enable this to cause Haraka to fork into the background on start-up (default: 0)
  - daemon_log_file - (default: /var/log/haraka.log) where to redirect stdout/stderr when daemonized
  - daemon_pid_file - (default: /var/run/haraka.pid) where to write a PID file to
  - graceful_shutdown - (default: false) enable this to wait for sockets on shutdown instead of closing them quickly
  - force_shutdown_timeout - (default: 30) number of seconds to wait for a graceful shutdown

- me

  A name to use for this server. Used in received lines and elsewhere. Setup
  by default to be your hostname.

- connection.ini

  See inline comments in connection.ini for the following settings:

  - main.spool_dir
  - main.spool_after
  - haproxy.hosts_ipv4
  - haproxy.hosts_ipv6
  - headers.\*
  - max.bytes
  - max.line_length
  - max.data_line_length
  - max.mime_parts
  - message.greeting
  - message.close
  - smtputf8
  - strict_rfc1869
  - uuid.deny_chars
  - uuid.banner_bytes

- plugin_timeout

  Seconds to allow a plugin to run before the next hook is called automatically
  default: 30

  Note also that each plugin can have a `config/<plugin_name>.timeout`
  file specifying a per-plugin timeout. In this file you can set a timeout of 0 to mean that this plugin's hooks never time out. Use this with care.

  If the plugin is in a sub-directory of plugins, then you must create this file
  in the equivalent path e.g. the queue/smtp_forward would need a timeout file in `config/queue/smtp_forward.timeout`

- outbound.ini

- outbound.bounce_message

  The bounce message if delivery of the message fails. The default is normally fine. Bounce messages contain a number of template replacement values which are best discovered by looking at the source code.
