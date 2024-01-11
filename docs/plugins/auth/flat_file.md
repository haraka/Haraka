# auth/flat\_file

The `auth/flat_file` plugin allows you to create a file containing username and password combinations, and have relaying users authenticate from that file.

Note that passwords are stored in clear-text, so this may not be a great idea for large scale systems. However the plugin would be a good start for someone looking to implement authentication using some other form of auth.

**Security** - it is recommended to switch to [auth-encfile][url-authencflat] to protect your user credentials.

**IMPORANT NOTE** - this plugin requires that STARTTLS be used via the tls plugin before it will advertise AUTH capabilities by the EHLO command.  Localhost and IPs in RFC1918 ranges 
are exempt from this rule.

## Configuration

Configuration is stored in `config/auth_flat_file.ini`.

* [core]methods

Authentication methods are listed in the `[core]methods` parameter. Authentification methods are comma separated. Currently supported methods are: `CRAM-MD5`, `PLAIN` and `LOGIN`. The `PLAIN` and `LOGIN` methods are insecure and require TLS to be enabled.

* [core]constrain_sender: (default: true). For outbound messages (due to successful AUTH), constrain the envelope sender (MAIL FROM) to the same domain as the authenticated user. This setting, combined with `rate_rcpt_sender` in the [limit](https://github.com/haraka/haraka-plugin-limit) plugin can dramatically reduce the amount of backscatter and spam sent when an email account is compromised.

Example:

```ini
[core]
methods=PLAIN,LOGIN,CRAM-MD5
constrain_sender=true
```

Users are stored in the `[users]` section.

Example:

```ini
[users]
user1=password1
user@domain.com=password2
```

[url-authencflat]: https://github.com/AuspeXeu/haraka-plugin-auth-enc-file
