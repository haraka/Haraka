Core Configuration Files
========================

See [Logging](Logging.md).

The Haraka core reads some configuration files to determine a few actions:

* smtp.yaml or smtp.json

If either of these files exist then they are loaded first after log.ini.
This file is designed to use the JSON/YAML file overrides documented in
Config.md to optionally provide the entire configuration in a single file.

* databytes

Contains the maximum SIZE of an email that Haraka will receive.

* plugins

The list of plugins to load

* smtp.ini

  Keys:

  * listen\_host, port - the host and port to listen on (default: ::0 and 25)
  * listen - (default: [::0]:25) Comma separated IP:Port addresses to listen on
  * inactivity\_time - how long to let clients idle in seconds (default: 300)
  * nodes - specifies how many processes to fork. The string "cpus" will fork as many
    children as there are CPUs (default: 0, which disables cluster mode)
  * user - optionally a user to drop privileges to. Can be a string or UID.
  * group - optionally a group to drop privileges to. Can be a string or GID.
  * ignore\_bad\_plugins - If a plugin fails to compile by default Haraka will stop at load time.
    If, however, you wish to continue on without that plugin's facilities, then
    set this config option
  * daemonize - enable this to cause Haraka to fork into the background on start-up (default: 0)
  * daemon\_log\_file - (default: /var/log/haraka.log) where to redirect stdout/stderr when daemonized
  * daemon\_pid\_file - (default: /var/run/haraka.pid) where to write a PID file to
  * spool\_dir - (default: none) directory to create temporary spool files in
  * spool\_after - (default: -1) if message exceeds this size in bytes, then spool the message to disk
    specify -1 to disable spooling completely or 0 to force all messages to be spooled to disk.
  * graceful\_shutdown - (default: false) enable this to wait for sockets on shutdown instead of closing them quickly
  * force_shutdown_timeout - (default: 30) number of seconds to wait for a graceful shutdown
  * smtputf8 - (default: true) advertise support for SMTPUTF8

* me

  A name to use for this server. Used in received lines and elsewhere. Setup
  by default to be your hostname.

* deny\_includes\_uuid

  Each connection and mail in Haraka includes a UUID which is also in most log
  messages. If you put a `1` in this file then every denied mail (either via
  DENY/5xx or DENYSOFT/4xx return codes) will include the uuid at the start
  of each line of the deny message in brackets, making it easy to track
  problems back to the logs.

  Because UUIDs are long, if you put a number greater than 1 in the config
  file, it will be truncated to that length. We recommend a 6 as a good
  balance of finding in the logs and not making lines too long.

* banner\_includes\_uuid

  This will add the full UUID to the first line of the SMTP greeting banner.

* early\_talker\_delay

  If clients talk early we *punish* them with a delay of this many milliseconds
  default: 1000.

* plugin\_timeout

  Seconds to allow a plugin to run before the next hook is called automatically
  default: 30

  Note also that each plugin can have a `config/<plugin_name>.timeout`
  file specifying a per-plugin timeout.  In this file you can set a timeout of 0 to mean that this plugin's hooks never time out.  Use this with care.

  If the plugin is in a sub-directory of plugins, then you must create this file
  in the equivalent path e.g. the queue/smtp_forward would need a timeout file in `config/queue/smtp_forward.timeout`

* smtpgreeting

  The greeting line used when a client connects. This can be multiple lines
  if required (this may cause some connecting machines to fail - though
  usually only spam-bots).

* max\_received\_count

  The maximum number of "Received" headers allowed in an email. This is a
  simple protection against mail loops. Defaults to 100.

* max\_line\_length

  The maximum length of lines in SMTP session commands (e.g. RCPT, HELO etc).
  Defaults to 512 (bytes) which is mandated by RFC 5321 §4.5.3.1.4. Clients
  exceeding this limit will be immediately disconnected with a "521 Command
  line too long" error.

* max\_data\_line\_length

  The maximum length of lines in the DATA section of emails. Defaults to 992
  (bytes) which is the limit set by Sendmail. When this limit is exceeded the
  three bytes "\r\n " (0x0d 0x0a 0x20) are inserted into the stream to "fix"
  it. This has the potential to "break" some email, but makes it more likely
  to be accepted by upstream/downstream services, and is the same behaviour
  as Sendmail. Also when the data line length limit is exceeded
  `transaction.notes.data_line_length_exceeded` is set to `true`.

* outbound.concurrency\_max

  Maximum concurrency to use when delivering mails outbound. Defaults to 100.

* outbound.disabled

  Put a `1` in this file to temporarily disable outbound delivery. Useful 
  while figuring out network issues or testing.

* outbound.bounce\_message

  The bounce message if delivery of the message fails. The default is normally fine. Bounce messages contain a number of template
  replacement values which are best discovered by looking at the source code.

* haproxy\_hosts

  A list of HAProxy hosts that Haraka should enable the PROXY protocol from.
  See [HAProxy.md](HAProxy.md)

* strict\_rfc1869

  When enabled, this setting requires senders to conform to RFC 1869 and
  RFC 821 when sending the MAIL FROM and RCPT TO commands. In particular,
  the inclusion of spurious spaces or missing angle brackets will be rejected.

  to enable:   `echo 1 > /path/to/haraka/config/strict_rfc1869`
  to disable:  `echo 0 > /path/to/haraka/config/strict_rfc1869`

* max_mime_parts

  Defaults to 1000. There's a potential denial of service in large numbers of
  MIME parts in carefully crafted emails. If this limit is too low for some
  reason you can increase it by setting a value in this file.

* connection\_close\_message
  
  Defaults to `closing connection. Have a jolly good day.` can be overrridden with custom text