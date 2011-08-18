rdns.regexp
===========

This plugin checks the reverse-DNS against a list of regular expressions. Any
matches will result in a rejection, unless there is an allow rule to
balance off broad regexes.

To give an example.  Assume we add a rule to deny all hosts with dynamic
in the rDNS hostname (.*dynamic.*).  Now we find a mail server,
generaldynamics.com that is clearly a false positive.  We could try
to correct the original regex (clearly it is a poorly written regex), or
we could add an allow rule for generaldynamics.com (.*generaldynamics\.com$).
This means that even though the dynamic block rule matches, it will be
superseded by the allow rule for generaldynamics.com.

Configuration
-------------

* rdns.deny_regexps

  The list of regular expressions to deny.  Over broad regexes in this list
  can be corrected by using the allow list. 

* rdns.allow_regexps

  The list of regular expressions to allow.  This list is always processed
  in favor of rules in the deny file.
