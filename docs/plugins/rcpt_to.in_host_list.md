rcpt\_to.in\_host\_list
=====================

This plugin is the mainstay of an inbound Haraka server. It should list the
domains that are local to the host. Mails that have RCPT TO not matching
a host in the given list will be passed onto other rcpt hooks. If no rcpt
hook accepts the connection, it will be rejected.

## Configuration

* host\_list

  Specifies the list of hosts that are local to this server.

* host\_list\_regex

  Specifies the list of regexes that are local to this server.  Note
  all these regexes are anchored with ^regex$. One can choose not to
  anchor with .\*. There is the potential for bad regexes to be
  too permissive if we don't anchor.

* host\_list.anti\_spoof

  When enabled, this will cause Haraka to reject any MAIL FROM where 
  the host appears within the host list but the connected host is not
  a relay, e.g. connection.relaying is not set either by SMTP AUTH or
  another plugin like 'relay'.

## Relaying

This plugin checks to see if the MAIL FROM domain is local. When
connection.relaying is detected (haraka -h relay) and the MAIL FROM domain is
local, this plugin will vouch for any RCPT. This limits relaying users to
sending from local domains, which is much safer than letting relay clients
send from any domain.
