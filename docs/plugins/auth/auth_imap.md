auth/auth\_imap
===============

The `auth/imap` plugin allows you to authenticate against an imap server.

## Configuration

Configuration is stored in `config/auth_imap.ini` and uses INI
style formatting.

These are the configuration settings:

* host: The host/IP that the imap server is listening on (default: localhost).

* port: The TCP port that the imap server is listening on (default: 143).

* tls: Perform implicit TLS connection? (default: false).

* rejectUnauthorized: Set rejectUnauthorized in tlsOptions for 
  imap connection (default: do not set tlsOptions).

* connTimeout: Number of milliseconds to wait for a connection to be 
  established (default: none).

* authTimeout: Number of milliseconds to wait to be authenticated after a 
  connection has been established (default: none).

* users: comma separated list of users (local part before '@') which are 
  allowed to be authenticated by the imap server. If this setting is missing,
  all users are allowed. So use this setting, if you have no control over 
  the imap server because otherwise you could create an open relay, e.g.
  if you would authenticate with gmail and do not set users, every gmail
  user could use your mail server to send mail (default: none).

* trace_imap: if true, emit imap debug information. Do not use this in
  production because it logs sensitive information, e.g. passowrds in
  clear text (default: none).

### Per-domain Configuration

Additionally, domains can each have their own configuration for connecting
to the imap server. The defaults are the same, so only the differences needs 
to be declared. Example:

    host=imap.example.com
    
    [gmail.com]
    host=imap.gmail.com
    port=993
    tls=true
    users=arthur,trillian,ford

    [example2.com]
    host=imap.example2.com
    port=993
    tls=true
