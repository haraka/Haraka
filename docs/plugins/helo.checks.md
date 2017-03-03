# helo.checks

This plugin performs a number of checks on the HELO string.

HELO strings are very often forged or dubious in spam and so this can be a
highly effective and false-positive free anti-spam measure.


## Usage

helo.checks results can be accessed by subsequent plugins:

    var h = connection.results.get('helo.checks');
    if (h.pass && h.pass.length > 5) {
        // nice job, you passed 6+ tests
    }
    if (h.fail && h.fail.length > 3) {
        // yikes, you failed 4+ tests!
    }
    if (connection.results.has('helo.checks','pass', /^forward_dns/) {
        // the HELO hostname is valid
    }


## Configuration

* helo.checks.regexps

  List of regular expressions to match against the HELO string. The regular
  expressions are automatically wrapped in `^` and `$` so they always match
  the entire string.

* helo.checks.ini

  INI file which controls enabling of certain checks:

    * dns\_timeout=30

      How many seconds to wait for DNS queries to timeout.


### [check]


    * valid\_hostname=true

      Checks that the HELO has at least one '.' in it and the organizational
      name is possible (ie, a host within a Public Suffix).

    * bare\_ip=true

      Checks for HELO <IP> where the IP is not surrounded by square brackets.
      This is an RFC violation so should always be enabled.

    * dynamic=true

      Checks to see if all or part the connecting IP address appears within
      the HELO argument to indicate that the client has a dynamic IP address.

    * literal\_mismatch=1|2|3

      Checks to see if the IP literal used matches the connecting IP address.
      If set to 1, the full IP must match.  If set to 2, the /24 must match.
      If set to 3, the /24 may match, or the IP can be private (RFC 1918).

    * match\_re=true

      See above. This is merely an on/off toggle.

    * big\_company=true

      See below. This is merely an on/off toggle.

    * forward\_dns=true

      Perform a DNS lookup of the HELO hostname and validate that the IP of
      the remote is included in the IP(s) of the HELO hostname.

      This test requires that the valid\_hostname check is also enabled.

    * rdns\_match=true

      Sees if the HELO hostname (or at least the domain) match the rDNS
      hostname(s).

    * host\_mismatch=true

      If HELO is called multiple times, checks if the hostname differs between
      EHLO invocations.

    * proto\_mismatch=true

      If EHLO was sent and the host later tries to then send HELO or vice-versa.

### [reject]

    For all of the checks included above, a matching key in the reject section
    controls whether messages that fail the test are rejected.

    Defaults shown:

    [reject]
    host_mismatch=false
    literal_mismatch=false
    proto_mismatch=false
    rdns_match=false
    dynamic=false
    bare_ip=false
    valid_hostname=false
    forward_dns=false
    big_company=false

### [skip]

    * private\_ip=true

      Bypasses checks for clients within RFC1918, Loopback or APIPA IP address ranges.

    * relaying

      Bypass checks for clients who have relaying privileges (whitelisted IP,
      SMTP-AUTH, etc).


### [bigco]

      A list of <helo>=<rdns>[,<rdns>...] to match against. If the HELO matches
      what's on the left hand side, the reverse-DNS must match one of the
      entries on the right hand side or the mail is blocked.

      Example:

            yahoo.com=yahoo.com,yahoo.co.jp
            aol.com=aol.com
            gmail.com=google.com
