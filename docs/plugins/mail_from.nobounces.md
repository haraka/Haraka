mail\_from.nobounces
===================

This mail blocks all bounce messages using the simple rule of checking
for `MAIL FROM:<>`.

This is useful to enable if you have a mail server that gets spoofed too
much but very few legitimate users. It is potentially bad to block all
bounce messages, but unfortunately for some hosts, sometimes necessary.
