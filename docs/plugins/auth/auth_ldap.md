auth/auth_ldap
==============

The `auth/auth_ldap` plugin...

Configuration
-------------

Configuration is stored in `config/auth_ldap.ini` and uses the INI
style formatting. 

are only two methods supported : `CRAM-MD5` and `LOGIN`. Be aware, the LOGIN
method is highly unsecure and can be used normaly only for local communication.
We stronly recommend only `CRAM-MD5` to be used.

Example:
    [core]
    methods=LOGIN,CRAM-MD5


Users are stored in the `[users]` section.

Example:

    [users]
    user1=password1
    user@domain.com=password2
