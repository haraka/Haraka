attachment
==========

This plugin allows you to reject messages based on Content-Type within 
the message or any MIME parts or on the filename of any attachments.

Limitations
-----------

This plugin cannot detect forged MIME types where the sender is lying
about the type.  The type is not confirmed in any way currently.

It also cannot read the filenames within tar/zip/rar archives.

Configuration
-------------

* attachment.filename.regex

  This file contains a list of regular expressions, one per line that 
  wil be tested against each filename found within a message.
  The first regexp to match will cause the message to be rejected.  
  Any invalid regexps will be detected, reported and skipped.

* attachment.ctype.regex

  This file contains a list of regular expressions, one per line that
  will be tested against each MIME Content-Type header in the message.
  The first regexp to match will cause the message to be rejected.
  Any invalid regexps will be detected, reported and skipped.
