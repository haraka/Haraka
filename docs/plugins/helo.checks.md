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

    * check\_no\_dot=1
    
      Checks that the HELO has at least one '.' in it.
    
    * check\_raw\_ip=1
    
      Checks for HELO <IP> where the IP is not surrounded by square brackets.
      This is an RFC violation so should always be enabled.
   
    * check\_dynamic=1

      Checks to see if all or part the connecting IP address appears within 
      the HELO argument to indicate that the client has a dynamic IP address.
    
    * check\_literal\_mismatch=1|2

      Checks to see if the IP literal used matches the connecting IP address.
      If set to 1, the full IP must match.  If set to 2, the /24 must match.

    * require\_valid\_tld=1

      Requires the HELO argument ends in a valid TLD if it is not an IP literal.

    * skip\_private\_ip=1

      Bypasses check\_no\_dot, check\_raw\_ip, check\_dynamic and require\_valid\_tld 
      for clients within RFC1918, Loopback or APIPA IP address ranges.

    * [bigco]
    
      A list of <helo>=<rdns>[,<rdns>...] to match against. If the HELO matches
      what's on the left hand side, the reverse-DNS must match one of the
      entries on the right hand side or the mail is blocked.
      
      Example:
      
            yahoo.com=yahoo.com,yahoo.co.jp
            aol.com=aol.com
       
