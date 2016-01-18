# Results

Add, log, retrieve, and share the results of plugin tests.

## Synopsis

Results is a structured way of storing results from plugins across a
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


### Config options

Each plugin can have custom settings in results.ini to control results logging.
There are three options available: hide, order, and debug.

* hide - a comma separated list of results to hide from the output
* order - a comman separated list, specifing the order of items in the output
* debug - log debug messages every time results are called

    ;put this in config/results.ini
    [plugin_name]
    hide=skip
    order=msg,pass,fail
    debug=0


### Results Functions

#### add

Store information. Most calls to `results` will append data to the lists
in the connection. The following lists are available:

    pass  - names of tests that passed
    fail  - names of tests that failed
    skip  - names of tests that were skipped (with a why, if you wish)
    err   - error messages encountered during processing
    msg   - arbitratry messages

    human - a custom summary to return (bypass collate)
    emit  - log an INFO summary

When err results are received, a logerror is automatically emitted, saving the
need to specify {emit: true} with the request.

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
display can be suppressed with the **hide** option in results.ini.


#### incr

Increment counters. The argument to incr is an object with counter names and
increment values. Examples:

    var c = connection;
    c.results.incr(plugin, {unrecognized_commands: 1});

    c.results.incr(plugin, {karma: -1});
    c.results.incr(plugin, {karma:  2});


#### push

Append items onto arrays. The argument to push is an object with array names and
the new value to be appended to the array. Examples:

    var c = connection;
    c.results.push(plugin, {dns_recs: 'name1'});
    c.results.push(plugin, {dns_recs: 'name2'});


#### collate

    var summary = connection.results.collate(plugin);

Formats the contents of the result cache and returns them. This function is
called internally by `add()` after each update.


#### get

Retrieve the stored results as an object. The only argument is the name of the
plugin whose results are desired.

    var geoip = connection.results.get('connect.geoip');
    if (geoip && geoip.distance && geoip.distance > 2000) {
        ....
    }

Keep in mind that plugins also store results in the transaction. Example:

    var sa = connection.transaction.results.get('spamassassin');
    if (sa && sa.score > 5) {
        ....
    }

#### has

Check result contents for string or pattern matches.

Syntax:
    results.has('plugin_name', 'result_name', 'search_term');

* result\_name: the name of an array or string in the result object

* search\_term: a string or RegExp object

Store Results:

    var r = connection.results;
    r.add(plugin, {pass: 'some_test'});
    r.add(plugin, {pass: 'some_test(with reason)'});

Retrieve exact match with **get**:

    if (r.get('plugin_name').pass.indexOf('some_test') !== -1) {
        // some_test passed (1x)
    };

Same thing with **has** (retrieve a string match):

    if (r.has('plugin_name', 'pass', 'some_test')) {
        // some_test passed (1x)
    }

The syntax for using **has** is a little more pleasant.

Both options require one to check for each reason which is unpleasant when
and all we really want to know is if some\_test passed or not.

To retrieve a matching pattern:

    if (r.has('plugin_name', 'pass', /^some_test/)) {
        // some_test passed (2x)
    }

### Private Results

To store structured data in results that are hidden from the human and
human_html output, prefix the name of the key with an underscore.

Example:

```js
connection.results.add(plugin, { _hidden: 'some data' });
```

## Redis Pub/Sub

If a redis client is found on server.notes.redis, then new results are JSON
encoded and published to Redis on the channel named `result-UUID`. Other
plugins can subscribe to these publish events by psubscribing (pattern
subscribe) to the channel named `result-UUID*`.  Replace UUID with the
connection UUID.

This is from the karma plugin, subscribing on the `connect_init` hook.

```js
exports.register = function (next, server) {
    this.inherits('redis');
}
exports.hook_connect_init = function (next, connection) {
    var plugin = this;
    plugin.redis_subscribe(connection, function () {
        connection.notes.redis.on('pmessage', function (pattern, channel, message) {
            // do fun stuff with messages that look like this
            // {"plugin":"karma","result":{"fail":"spamassassin.hits"}}
            // {"plugin":"connect.geoip","result":{"country":"CN"}}
        });
        next();
    });
}
```

It's also wise to unsubscribe. It's easy to do on the `disconnect` hook:

```js
    exports.hook_disconnect = function (next, connection) {
        this.redis_unsubscribe(connection);
    }
```
