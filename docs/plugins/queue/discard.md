# discard

This plugin will discard a message by pretending that the message was queued.

It is designed to be used by other plugins which request the message be 
discard by setting a connection or transaction note that this plugin
checks.

It uses the 'queue' hook, so it runs after all the plugins that hook on `data_post`.

If you use the 'quarantine' plug-in then this plugin should run *after* it.

USE THIS PLUGIN WITH CARE!

# Enable

Enable by adding a `queue/discard` entry in `config/plugins` **before** your
other queue plugins that perform actual deliveries.

# Usage

Set

```javascript
connection.notes.discard = [ 1 | true ];
```

or

```javascript
connection.transaction.notes.discard = [ 1 | true ];
```
