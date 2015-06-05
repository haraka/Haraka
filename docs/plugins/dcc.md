dcc
---

NOTE: this plugin is not feature complete.

The Distributed Checksum Clearinghouses or DCC is an anti-spam content filter.
See http://www.dcc-servers.net/dcc/ for details of how it works.

This plugin implements the protocol used by the dccifd daemon to communicate
with DCC.

It requires that you install the DCC client and configure and start-up the
dccifd daemon as per the documentation and expects the dccifd socket to be
/var/dcc/dccifd.

Currently it only reports results to the logs, it does not reject, greylist
or do anything with the results of any kind.

You can report spam to DCC during reception by setting:
`connection.transaction.notes.training_mode = 'spam'`

