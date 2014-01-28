# note.js

Save, log, retrieve, and share the results of plugin tests.

## Synopsis

Potential reasons to use *note* in your plugin:

* So your plugin results appear in *watch* output, in your web browser.

* To store results and emit log entries in one line of code.

* To do all your plugins processing, have the results stored for you and
  then have a single LOGINFO message summarize the results.

Towards those goals, **Note** provides some help. Here's how:

* Each call to note does not log the call unless _emit_ is true. In the
   simple cases, call *note* as many times as necessary. When finished,
   call *note* with _emit: true_ and a summary of the note will be logged.

* Each call to note logs a summary when loglevel is DEBUG or PROTOCOL.

* At any time, summary results can be fetched with *note_collate*.

* The *hide* option can suppress unwanted results from the summary.

* The order of display can be set with the *order* value.

* If the summary results don't suit your fancy, overload *note_collate*.


## Usage

Use this plugin in yours:

    exports.register = function () {
        this.inherits('note');
    };

    exports.my_great_hook = function(next, connection) {
        this.note_init({conn: connection, plugin: this});

        // run a test
        ......

        // store the results
        this.note({conn: connection, pass: 'my great test' });

        // run another test
        .....

        // store the results
        this.note({conn: connection, fail: 'gotcha!', msg: 'show this'});
    }

Store the note in the transaction (vs connection):

    this.note_init({conn: connection, plugin: this, txn: true});


### Exported functions

There are three functions exported by note: note\_init, note, and
note\_collate.

#### note\_init

Initialize a connection note. The options are:

* conn   - connection object (required)
* plugin - plugin object     (mostly required, default: this)
* txn    - store note in transaction? (default: false)
* hide   - note properties to hide from collated results (see note\_collate)
* order  - custom ordering of the collated summary (see note\_collate)

#### note

Store some information. Most calls to note will append data to the lists
in the connection note. The following lists are available:

    pass  - names of tests that passed
    fail  - names of tests that failed
    skip  - names of tests that were skipped (with a why, if you wish)
    err   - error messages encountered during processing
    msg   - arbitratry messages

    human - a custom summary to return (bypass note_collate)
    emit  - log an INFO summary

Examples:

    this.note({conn: connection, pass: 'null_sender'});
    this.note({conn: connection, fail: 'single_recipient'});
    this.note({conn: connection, skip: 'valid_bounce'};
    this.note({conn: connection, err: 'timed out looking in couch cushions'});
    this.note({conn: connection, msg: 'I found a nickel!', emit: true});

In addition to appending values to the predefined lists, arbitrary results
can be stored in the note:

    this.note({conn: connection, my_result: 'anything I want'});

When arbirary values are stored, they are prepended to the log output. Their
display can be suppressed with the **hide** option to note or note\_init.


#### note\_collate

A note must be passed in.

    var summary = this.note_collate(connection.notes.my_plugin);

Formats the contents of the note object, saves them to the 'human' note
property and returns them. This method is called internally by *note*
after each update.


## Where is the note stored?

The default location is:

    connection.notes.plugin_name

When the txn=true setting is used, the note is stored at:

    connection.transaction.notes.plugin_name

The location of the note can be altered by setting plugin.note\_name before
initializing the note.
