discard
==========

This plugin will discard a message by pretending that the message was queued.

It is designed to be used by other plugins which request the message be 
discard by setting a connection or transaction note that this plugin
checks.

It uses the 'queue' hook, so that it runs after all the 'data_post' plugins
and should be listed in 'config/plugins' to run before your queue hooks that
perform actual deliveries.

If you use the 'quarantine' plug-in then this plugin should run *after* it.

USE THIS PLUGIN WITH CARE!

Usage
-----

Set

```javascript
connection.notes.discard = [ 1 | true ];
```

or

```javascript
connection.transaction.notes.discard = [ 1 | true ];
```
