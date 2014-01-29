mail\_from.is\_resolvable
=======================

This plugin checks that the domain used in MAIL FROM is resolvable to an MX
record.

Configuration
-------------

This plugin uses the INI-style file format and accepts the following options:

* timeout

  Default: 30
  
  Maximum limit in seconds for queries to complete.  If the timeout is
  reached a TEMPFAIL is returned to the client.

* allow\_mx\_ip=[0|1]

  Allow MX records that return IP addresses instead of hostnames.
  This is not allowed as per the RFC, but some MTAs allow it.

* reject\_no\_mx=[0|1]

  Return DENY and reject the command if no MX record is found.  Otherwise a
  DENYSOFT (TEMPFAIL) is returned and the client will retry later.
  
  DNS errors always return DENYSOFT, so this should be safe to enable.
