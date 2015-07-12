attachment
==========

This plugin allows you to reject messages based on Content-Type within 
the message or any MIME parts or on the filename of any attachments.

Limitations
-----------

This plugin cannot detect forged MIME types where the sender is lying
about the type.  The type is not confirmed in any way currently.

Encrypted archives that contain encrypted sub-archives cannot be
expanded and will cause the plugin to reject the message.


Requirements
------------

To be able to check filenames inside archive files the npm module
`tmp` is required and the `bsdtar` binary must be available.

If either `tmp` or `bsdtar` are unavailable then the plugin will
automatically disable expansion of archive files.


Logging
-------

At INFO level logging this plugin will output the filename and type
of each attached file along with an MD5 checksum of the contents.
The MD5 checksum is useful to check against www.virustotal.com


Configuration
-------------

* attachment.ini
    * default settings shown

  - timeout=30

    Timeout in seconds before the plugin will abort.

  - disallowed_extensions=exe,com,pif,bat,scr,vbs,cmd,cpl,dll

    File extensions that should be rejected when detected.

    [archive]
  - max\_depth=5

    The maximum level of nested archives that will be unpacked.
    If this is exceeded the message will be rejected.

    [archive]
  - extensions=zip,tar,tgz,taz,z,gz,rar,7z

    File extensions that should be treated as archives.
    This can be any file type supported by bsdtar.


* attachment.filename.regex

  This file contains a list of regular expressions, one per line that 
  will be tested against each filename found within a message.
  The first regexp to match will cause the message to be rejected.  
  Any invalid regexps will be detected, reported and skipped.

* attachment.archive.filename.regex

  This file contains a list of regular expressions, one per line that
  will be tested against each filename found within an archive file.
  The first regexp to match will cause the message to be rejected.
  Any invalid regexps will be detected, reported and skipped.

* attachment.ctype.regex

  This file contains a list of regular expressions, one per line that
  will be tested against each MIME Content-Type header in the message.
  The first regexp to match will cause the message to be rejected.
  Any invalid regexps will be detected, reported and skipped.
