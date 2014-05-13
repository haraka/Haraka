# `auth/auth_vpopmaild`

The `auth/vpopmaild` plugin allows you to authenticate against a vpopmaild
daemon.

## Configuration

Configuration is stored in `config/auth_vpopmaild.ini` and uses the INI
style formatting.

There are three configuration settings:

* host: The host/IP that vpopmaild is listening on (default: localhost).

* port: The TCP port that vpopmaild is listening on (default: 89).

* sysadmin: A colon separated username:password of a vpopmail user with
    SYSADMIN privileges. This is only necessary to support CRAM-MD5. On new
    installs, it best not to use CRAM-MD5, as it requires storing the
    credentials on the server in clear text. However, if you have existing
    clients whose MUA is configured to authenticate with CRAM-MD5, you'll
    need to enable this.


### Per-domain Configuration

Additionally, domains can each have their own configuration for connecting
to vpopmaild. The defaults are the same, so only the differences needs to
be declared. Example:

    [example.com]
    host=192.168.0.1
    port=999

    [example2.com]
    host=192.168.0.2
    sysadmin=postmaster@example2.com:sekret
