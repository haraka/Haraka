auth/flat\_file
==============

The `auth/flat_file` plugin allows you to create a file containing username
and password combinations, and have relaying users authenticate from that
file.

Note that passwords are stored in clear-text, so this may not be a great idea
for large scale systems. However the plugin would be a good start for someone
looking to implement authentication using some other form of auth.

**IMPORANT NOTE** - this plugin requires that STARTTLS be used via the tls plugin 
before it will advertise AUTH capabilities by the EHLO command.  This is to 
improve security out-of-the-box.   Localhost and any IP in RFC1918 ranges 
are automatically exempt from this rule.

Configuration
-------------

Configuration is stored in `config/auth_flat_file.ini` and uses the INI
style formatting. 

Authentication methods are listed in the `[core]` section under `methods`
parameter. You can list a few authentification methods comma separated. Currently
only two methods are supported : `CRAM-MD5` and `LOGIN`. Be aware, the LOGIN
method is highly unsecure and should be used only for local communication.
We strongly recommend only `CRAM-MD5`.

Example:
    [core]
    methods=LOGIN,CRAM-MD5


Users are stored in the `[users]` section.

Example:

    [users]
    user1=password1
    user@domain.com=password2
