# `rcpt_to.ldap.js`

This plugin tries to validate recipients against an LDAP server. This will help
in replacing an existing qmail-ldap installation with Haraka.

The plugin assumes simple qmail-ldap style LDAP records. It is completely
configurable using the `config/rcpt_to.ldap.ini` file.

The logic that is followed is:

  * Check if the recipient is for a local domain (ie. check if the domaiin is
    present in `host_list`)

  * Check if the recipient is already whitelisted

  * Run an LDAP search to see if the recipient can be found in LDAP.


