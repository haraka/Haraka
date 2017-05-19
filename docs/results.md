# results.js

Save, log, retrieve, and share the results of plugin tests.

## Synopsis

Potential reasons to use *results* in your plugin:

* To have plugin results appear in
  [watch](http://haraka.github.io/manual/plugins/watch.html) output, in your web browser.

* To store results and emit log entries in one line of code.

* To do all your plugins processing, have the results stored for you and
  then emit a single LOGINFO message to summarize the results.

Towards those goals, **results** provides some help. Here's how:

* Each call to result does not log the call unless _emit_ is true. In the
   simple cases, call *results* as many times as necessary. When finished,
   call *results* with _emit: true_ and a summary of the results will be
   logged.

* Each call to results logs a summary when loglevel is DEBUG or PROTOCOL.

* At any time, summary results can be fetched with *collate*.

* The *hide* option can suppress unwanted results from the summary.

* The order of display can be set with the *order* value.

## Usage

Use this plugin in yours:

    var Results = require('./results');

    exports.my_first_hook = function(next, connection) {
        var plugin = this;
        plugin.results = new Results(connection, plugin);

        // run a test
        ......

        // store the results
        plugin.results.save({pass: 'my great test' });

        // run another test
        .....

        // store the results
        plugin.results.save({fail: 'gotcha!', msg: 'show this'});
    }

Store the results in the transaction (vs connection):

        plugin.results = new Note(connection, plugin, {txn: true});

Don't show skip messages

        plugin.results = new Note(connection, plugin, {hide: ['skip']});

### Required arguments for a new Note:

* connection object (required)
* plugin object     (sometimes, default: this)

#### Optional Arguments

* txn    - store results in transaction? (default: false)
* hide   - results properties to hide from collated results (see collate)
* order  - custom ordering of the collated summary (see collate)

### Exported functions

#### save

Store some information. Most calls to results will append data to the lists
in the connection results. The following lists are available:

    pass  - names of tests that passed
    fail  - names of tests that failed
    skip  - names of tests that were skipped (with a why, if you wish)
    err   - error messages encountered during processing
    msg   - arbitratry messages

    human - a custom summary to return (bypass collate)
    emit  - log an INFO summary

Examples:

    results.save({pass: 'null_sender'});
    results.save({fail: 'single_recipient'});
    results.save({skip: 'valid_bounce'};
    results.save({err: 'timed out looking in couch cushions'});
    results.save({msg: 'I found a nickel!', emit: true});

In addition to appending values to the predefined lists, arbitrary results
can be stored in the results:

    results.save({my_result: 'anything I want'});

When arbirary values are stored, they are listed first in the log output. Their
display can be suppressed with the **hide** option to _save_ or _init_.


#### collate

A connection must be passed in.

    var summary = results.collate();

Formats the contents of the results object and returns them. This function is
called internally by *save* after each update.


## Where are the results stored?

The default location is:

    connection.results.plugin_name

When the txn=true setting is used, the results is stored at:

    connection.transaction.results.plugin_name

The plugin\_name can be overridden by setting plugin.results\_name before
initializing Results.
