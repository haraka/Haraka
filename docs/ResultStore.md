# Result Store

Add, log, retrieve, and share the results of plugin tests.

## Synopsis

Result Store is a structured way of storing results from plugins across a
session, allowing those results to be retrieved later or by other plugins.

## Usage

Use this plugin in yours:

    exports.my_first_hook = function(next, connection) {
        var plugin = this;

        // run a test
        ......

        // store the results
        connection.results.add(plugin, {pass: 'my great test' });

        // run another test
        .....

        // store the results
        connection.results.add(plugin, {fail: 'gotcha!', msg: 'show this'});
    }

Store the results in the transaction (vs connection):

        connection.transaction.results.add(plugin, {...});

Don't show skip messages

        ;put this in config/result_store.ini
        [plugin_name]
        hide=skip

### Results Functions

#### add

Store some information. Most calls to `results` will append data to the lists
in the connection. The following lists are available:

    pass  - names of tests that passed
    fail  - names of tests that failed
    skip  - names of tests that were skipped (with a why, if you wish)
    err   - error messages encountered during processing
    msg   - arbitratry messages

    human - a custom summary to return (bypass collate)
    emit  - log an INFO summary

Examples:
    
    var c = connection;
    c.results.add(plugin, {pass: 'null_sender'});
    c.results.add(plugin, {fail: 'single_recipient'});
    c.results.add(plugin, {skip: 'valid_bounce'};
    c.results.add(plugin, {err: 'timed out looking in couch cushions'});
    c.results.add(plugin, {msg: 'I found a nickel!', emit: true});

In addition to appending values to the predefined lists, arbitrary results
can be stored in the cache:

    results.add(plugin, {my_result: 'anything I want'});

When arbirary values are stored, they are listed first in the log output. Their
display can be suppressed with the **hide** option to `add()`.


#### collate

    var summary = connection.results.collate(plugin);

Formats the contents of the result cache and returns them. This function is
called internally by `add()` after each update.
