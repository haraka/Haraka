# note.js

Save, log, retrieve, and share the results of plugin tests.

## Synopsis

Potential reasons to use *note* in your plugin:

* To have plugin results appear in
  [watch](http://haraka.github.io/manual/plugins/watch.html) output, in your web browser.

* To store results and emit log entries in one line of code.

* To do all your plugins processing, have the results stored for you and
  then emit a single LOGINFO message to summarize the results.

Towards those goals, **Note** provides some help. Here's how:

* Each call to note does not log the call unless _emit_ is true. In the
   simple cases, call *note* as many times as necessary. When finished,
   call *note* with _emit: true_ and a summary of the note will be logged.

* Each call to note logs a summary when loglevel is DEBUG or PROTOCOL.

* At any time, summary results can be fetched with *collate*.

* The *hide* option can suppress unwanted results from the summary.

* The order of display can be set with the *order* value.

## Usage

Use this plugin in yours:

    var Note = require('./note');

    exports.my_first_hook = function(next, connection) {
        var plugin = this;
        plugin.note = new Note(connection, plugin);

        // run a test
        ......

        // store the results
        plugin.note.save({pass: 'my great test' });

        // run another test
        .....

        // store the results
        plugin.note.save({fail: 'gotcha!', msg: 'show this'});
    }

Store the note in the transaction (vs connection):

        plugin.note = new Note(connection, plugin, {txn: true});

Don't show skip messages

        plugin.note = new Note(connection, plugin, {hide: ['skip']});

### Required arguments for a new Note:

* connection object (required)
* plugin object     (sometimes, default: this)

#### Optional Arguments

* txn    - store note in transaction? (default: false)
* hide   - note properties to hide from collated results (see collate)
* order  - custom ordering of the collated summary (see collate)

### Exported functions

#### save

Store some information. Most calls to note will append data to the lists
in the connection note. The following lists are available:

    pass  - names of tests that passed
    fail  - names of tests that failed
    skip  - names of tests that were skipped (with a why, if you wish)
    err   - error messages encountered during processing
    msg   - arbitratry messages

    human - a custom summary to return (bypass collate)
    emit  - log an INFO summary

Examples:

    note.save({pass: 'null_sender'});
    note.save({fail: 'single_recipient'});
    note.save({skip: 'valid_bounce'};
    note.save({err: 'timed out looking in couch cushions'});
    note.save({msg: 'I found a nickel!', emit: true});

In addition to appending values to the predefined lists, arbitrary results
can be stored in the note:

    note.save({my_result: 'anything I want'});

When arbirary values are stored, they are listed first in the log output. Their
display can be suppressed with the **hide** option to _save_ or _init_.


#### collate

A connection must be passed in.

    var summary = note.collate();

Formats the contents of the note object and returns them. This function is
called internally by *save* after each update.


## Where is the note stored?

The default location is:

    connection.notes.plugin_name

When the txn=true setting is used, the note is stored at:

    connection.transaction.notes.plugin_name

The plugin\_name can be overridden by setting plugin.note\_name before
initializing the note.
