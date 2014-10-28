data.noreceived
===============

NOTICE: this plugin is deprecated. Use data.headers instead.

This plugin very simply blocks any mail arriving at your system that has no
`Received` headers.

This is an aggressive anti-spam measure, but works because all real mail
relays will add a `Received` header according to the RFCs. It may false
positive on some bulk mail that uses a custom tool to send, but this appears
to be fairly rare.
