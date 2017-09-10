quarantine
==========

This plugin will save a message (in message/rfc822 format) to a specified
directory, which will be created automatically if it does not already exist,
a dated sub-folder is also added to the end of the path specified in YYYYMMDD
format.

It is designed to be used by other plugins which request the message be
quarantined by setting a connection or transaction note that this plugin
checks.

NOTE: this plugin simply saves a copy of the message.  It does not reject or
discard the message and relies on another plugin to perform this function.

It uses the 'queue' hook, so that it runs after all the 'data_post' plugins
and should be listed in 'config/plugins' to run before your queue hooks that
perform actual deliveries.

To ensure that only completely written files are present in the quarantine,
the files are written to a temporary directory first and then hardlinked to
the final destination before the temporary file is deleted.

The temporary directory is 'quarantine_path/tmp' which defaults to:
/var/spool/haraka/quarantine/tmp.

Upon start-up, any files present in the temporary directory are deleted
syncronously prior to any messages being accepted.


Configuration
-------------

This plugin looks for 'quarantine.ini' in the config directory.

* quarantine\_path                   (default: /var/spool/haraka/quarantine)

  The default base path to save the quarantine files to.  It will be created
  if it does not already exist.


Usage
-----

If you wish to keep a copy of the message in your plugin, simply either:

```javascript
connection.notes.quarantine = [ 1 | true | 'sub/directory/path' ];
```

or

```javascript
connection.transaction.notes.quarantine = [ 1 | true | 'sub/directory/path' ];
```

e.g.

```javascript
connection.notes.quarantine = 1;
```

would save the message to '/var/spool/quarantine/haraka/YYYYMMDD/UUID' where
YYYMMDD and UUID are expanded to current date and transaction UUID.

and

```javascript
connection.notes.quarantine = 'corpus';
```

would save the message to '/var/spool/quarantine/haraka/corpus/YYYYMMDD/UUID'.

Note: you can specify 'corpus/foo' or 'corpus/foo/bar' and the directories will
be automatically created.  Do not add any leading or trailing slashes.

By default - after the message is quarantined, the plugin will tell Haraka to
continue to the next plugin.  You can specify a different action like DENY or
OK and supply an optional message using the following notes:

```javascript
connection.notes.quarantine_action = [ OK, 'Message quarantined' ];
connection.transaction.notes.quarantine_action = [ DENY, 'Message rejected' ];
```

If you don't want to supply a specific message back to the client you can
also just specify a return code:

```javascript
connection.notes.quarantine_action = OK;
connection.transaction.notes.quarantine_action = DENY;
```
