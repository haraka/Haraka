# tarpit

This plugin is designed to introduce deliberate delays on the response
of every hook in order to slow down a connection. It has no
configuration and is designed to be used only by other plugins.

It must be loaded early in config/plugins (e.g. before any plugins
that accept recipients or that return OK) but must be loaded _after_
any plugins that wish to use it.

## Usage

To use this plugin in another plugin set:

    connection.notes.tarpit = <seconds to delay>;

or

    connection.transaction.notes.tarpit = <seconds to delay>;

## Configuration

The configuration file for tarpit is config/tarpit.ini.

- hooks_to_delay - a list of hooks to delay at. This setting can be used to
  override the default list in the plugin. For example, if you notice that
  malware is disconnecting after delaying rcpt_ok, you can remove just that
  hook from the list:

hooks_to_delay=connect,helo,ehlo,mail,rcpt,data,data_post,queue,unrecognized_command,vrfy,noop,rset,quit

## Plugin Timeout

config/tarpit.timeout (Default: 0)

All Haraka plugins can configure a _name_.timeout file. The timeout specifies
how long Haraka lets the plugin do nothing before it times out. When zero,
there is no timeout. When non-zero and _seconds to delay_ is longer than
tarpit.timeout (default: 1s), you'll get errors like this in your log files:

    [core] Plugin tarpit timed out on hook rcpt - make sure it calls the callback
    [core] Plugin tarpit timed out on hook quit - make sure it calls the callback

The solution is to set the contents of config/tarpit.timeout to zero or
**seconds to delay** + 1.

## Logging

When tarpitting a command it will log 'tarpitting response for Ns' to
the INFO facility where N is the number of seconds.
