# auth/auth\_vpopmaild

The `auth/vpopmaild` plugin allows SMTP users to authenticate against a vpopmaild daemon.

## Configuration

The configuration file is stored in `config/auth_vpopmaild.ini`.

### settings

* host: The host/IP that vpopmaild is listening on (default: localhost).

* port: The TCP port that vpopmaild is listening on (default: 89).

* sysadmin: A colon separated username:password of a vpopmail user with SYSADMIN privileges (see vpopmail/bin/vmoduser -S). This is **only** necessary to support CRAM-MD5 which requires access to the clear text password. On new installs, it's best not to use CRAM-MD5, as it requires storing clear text passwords. Legacy clients with MUAs configured to authenticate with CRAM-MD5 will need this enabled.

* constrain_sender: (default: true). For outbound messages (due to successful AUTH), constrain the envelope sender (MAIL FROM) to the same domain as the authenticated user. This setting, combined with `rate_rcpt_sender` in the [limit](https://github.com/haraka/haraka-plugin-limit) plugin can dramatically reduce the amount of backscatter and spam sent when an email account is compromised.


### Per-domain Configuration

Additionally, domains can each have their own configuration for connecting
to vpopmaild. The defaults are the same, so only the differences needs to
be declared. Example:

```ini
[example.com]
host=192.168.0.1
port=999

[example2.com]
host=192.168.0.2
sysadmin=postmaster@example2.com:sekret
```
