helo.checks
===========

This plugin performs a number of checks on the HELO string.

HELO strings are very often forged or dubious in spam and so this can be a
highly effective and false-positive free anti-spam measure.

Configuration
-------------

* helo.checks.regexps

  List of regular expressions to match against the HELO string. The regular
  expressions are automatically wrapped in `^` and `$` so they always match
  the entire string.

* helo.checks.ini

  INI file which controls enabling of certain checks:

    * check_no_dot=1
    
      Checks that the HELO has at least one '.' in it.
    
    * check_raw_ip=1
    
      Checks for HELO <IP> where the IP is not surrounded by square brackets.
      This is an RFC violation so should always be enabled.
    
    * [bigco]
    
      A list of <helo>=<rdns>[,<rdns>...] to match against. If the HELO matches
      what's on the left hand side, the reverse-DNS must match one of the
      entries on the right hand side or the mail is blocked.
      
      Example:
      
        yahoo.com=yahoo.com,yahoo.co.jp
        aol.com=aol.com
        