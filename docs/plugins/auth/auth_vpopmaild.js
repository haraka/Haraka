auth/auth\_vpopmaild
==============

The `auth/vpopmaild` plugin allows you to authenticate against a vpopmaild
daemon.

Configuration
-------------

Configuration is stored in `config/auth_vpopmaild.ini` and uses the INI
style formatting.

There are two configuration settings:

host: The host/IP that vpopmaild is listening on (default: localhost).

port: The TCP port that vpopmaild is listening on (default: 89).

## Per-domain routing

Additionally, domains can each have their own routing instructions for
connecting to vpopmaild. The defaults are the same, so only the
differences needs to be declared. Example:

    [example.com]
    host=192.168.0.1

    [example2.com]
    host=192.168.0.2
