log.syslog
==========

This plugin adds syslog support to haraka.  Most log levels in haraka
already map to valid levels in syslog.  Additional log levels in haraka
fall under the DEBUG syslog level.  Note: this plugin requires modern-syslog and you need enable/add log.syslog inside config/plugins at the top of the file.

Configuration log.syslog.ini
----------------------------

This is the general configuration file for the log.syslog plugin.
In it you can find ways to customize the syslog service name, set the
logging facility, and set any syslog options you wish. For example:
```
[general]
name=SomeOtherName
```
Sane defaults are
chosen for you.

* log.syslog.general.name (default: haraka)

  The service name to show up in the logs.


* log.syslog.general.facility (default: MAIL)

  The syslog logging facility to use.  MAIL makes the most sense, but some
  default syslog configs may try to do something special with this log level.
  FreeBSD and OSX, for example, does not log all messages sent to this log
  level to the same file.
  Valid options are:
      MAIL
      KERN
      USER
      DAEMON
      AUTH
      SYSLOG
      LPR
      NEWS
      UUCP
      LOCAL0 ... LOCAL7

* log.syslog.general.pid (default: 1)

  Option to put the PID in the log message.


* log.syslog.general.odelay (default: 1)

  Option to open the connection on the first log message.


* log.syslog.general.ndelay (default: 0)

    Option to open the connection immediately.


* log.syslog.general.cons (default: 0)

    Option to write directly to system console if there is an error
    while sending to system logger.


* log.syslog.general.nowait (default: 0)

    Don't wait for child processes that may have been created while
    logging the message.


* log.syslog.general.always\_ok (default: false)

    If false, then this plugin will return with just next() allowing other
    plugins that have registered for the log hook to run.  To speed things up,
    if no other log hooks need to run (daemon), then one can make this true.
    This will case the plugin to always call next(OK).
