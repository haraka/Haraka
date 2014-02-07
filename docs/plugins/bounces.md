bounce
===================
This plugin provides options for bounce processing.


Configuration
-------------------

- reject\_all

Blocks all bounce messages using the simple rule of checking
for `MAIL FROM:<>`.

This is useful to enable if you have a mail server that gets spoofed too
much but very few legitimate users. It is potentially bad to block all
bounce messages, but unfortunately for some hosts, sometimes necessary.


- reject\_invalid
--------------------
This option tries to assure the message really is a bounce. It makes
sure the message has a single recipient and that the return path is
empty.
