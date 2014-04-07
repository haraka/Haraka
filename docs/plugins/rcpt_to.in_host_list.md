# `rcpt_to.in_host_list`

This plugin is the mainstay of an inbound Haraka server. It should list the
domains that are local to the host. Mails that have RCPT TO not matching
a host in the given list will be passed onto other rcpt hooks. If no rcpt
hooks accept the connection, it will be rejected.

## Configuration

* host\_list
  
  Specifies the list of hosts that are local to this server.

* host\_list\_regex
  
  Specifies the list of regexes that are local to this server.  Note
  all these regexes are anchored with ^regex$. One can choose not to
  anchor with .\*. There is the potential for bad regexes to be
  too permissive if we don't anchor.

## Relaying

When connection.relaying is set (haraka -h relay), this plugin will
validate the sender against the host list and vouch for any recipient.
This limits relaying users to sending from domains that you accept mail for,
which is almost always The Right Thing[TM] to do.
