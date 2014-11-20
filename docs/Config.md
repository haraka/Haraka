Config Files
============

Haraka contains a flexible config loader which can load a few different types
of configuration files.

The API is fairly simple:

    // From within a plugin:
    var config_item = this.config.get(name, [type], [callback], [options]);

`name` is not a filename, but a name in the config/ directory. For example:

    var config_item = this.config.get('rambling.paths', 'list');

This will load the file config/rambling.paths in the Haraka directory.

`type` can be one of:

* 'value' - load a flat file containing a single value (default)
* 'ini' - load an "ini" style file
* 'json' - load a json file
* 'list' - load a flat file containing a list of values
* 'data' - load a flat file containing a list of values, keeping comments and whitespace.

If your ini and json files have `.ini` and `.json` suffixes,
the `type` parameter can be omitted.  

See the [File Formats](#file_formats) section below for a more detailed
explaination of each of the formats.

`callback` is an optional callback function that will be called when
an update is detected on the file after the configuration cache has been 
updated by re-reading the file.  You can use this to refresh configuration
variables within your plugin if you are not calling `config.get` within
one of the hooks (e.g. if you use the `register()` function):

`````javascript
var cfg;  // variable global to this plugin only

exports.register = function () {
    var plugin = this;
    plugin.loginfo('calling register function');
    cfg = plugin.config.get('my_plugin.ini', function () {
        // This closure will be run for each detected update of my_plugin.ini
        // Re-run the outer function again
        plugin.register();
    });
    plugin.loginfo('cfg=' + JSON.stringify(cfg));
}

exports.hook_connect = function (next, connection) {
    // cfg variable available here and will always be up-to-date
}
`````

The optional `options` object can accepts the following keys:

* `no_watch` (default: false) - this prevents Haraka from watching the file
for updates.
* `no_cache` (default: false) - this prevents Haraka from caching the file
in the configuration cache which means that the file will be re-read on
every call to `config.get`.  This is not recommended as configuration files
are read using syncronous functions and will therefore block the event loop
and slow down the operation of Haraka.
* `booleans` (default: none) - for .ini file types, this allows you to specify
keys that are boolean types and to default the boolean to true or falsae if 
desired.  See below for details.

<a name="file_formats">File Formats</a>
============

Ini Files
---------

INI files had their heritage in early versions of Microsoft Windows products.  
They are a simple format of key=value pairs, with an optional [section].

Here is a typical example:

    first_name=Matt
    last_name=Sergeant
    
    [job]
    title=Senior Principal Software Engineer
    role=Architect

That produces the following Javascript object:

````javascript
{
    main: {
        first_name: 'Matt',
        last_name: 'Sergeant'
    },
    job: {
        title: 'Senior Principal Software Engineer',
        role: 'Architect'
    }
}
````
The key point there is that items before any [section] marker go in the "main"
section.

Note that there is some auto-conversion of values on the right hand side of
the equals: integers are converted to integers, floats are converted to
floats.

The key=value pairs also support continuation lines using the
backslash "\" character.

The `options` object allows you to specify which keys are boolean:

    { booleans: ['reject','some_true_value'] }

The key names should be in the format section.key, if the key name does not
specify a section name then it will be presumed to be 'main'.

This ensures these values are converted to true Javascript booleans when parsed,
and supports the following options for boolean values:

    true, yes, ok, enabled, on, 1

Anything else is treated as false.

If you wish to default the boolean to true (e.g. when the key is undefined or
the config file is missing) then prefix the key with +:

    { booleans: [ '+reject' ] }

For completeness the inverse is also allowed:

    { booleans: [ '-reject' ] }

Flat Files
----------

Flat files are simply either lists of values separated by \n or a single
value in a file on its own. Those who have used qmail or qpsmtpd will be
familiar with this format.   
Lines starting with '#' and blank lines will be ignored unless the type is
specified as 'data', however even then line endings will be stripped.   
See plugins/dnsbl.js for an example.

JSON Files
----------

These are as you would expect, and returns an object as given in the file.

Reloading/Caching
========

Haraka automatically reloads configuration files, but this will only help if
whatever is looking at that config re-calls config.get() to re-access the 
configuration file after it has changed. Configuration files are watched for
changes so this process is not a heavyweight "poll" process, and files are
not re-read every time config.get() is called so this can be considered a
lightweight process.

On Linux/Windows if you create a previously non-existant file that Haraka
has tried to read in the past; it will notice immediately and will load 
that configuration file.   For other operating systems it will take up to
60 seconds for this to happen due to the differences between the various 
kernel APIs for watching files/directories.

Note that Haraka reads a number of configuration files and any configuration
read in a plugins register() function *before* it drops privileges, so you
should make sure that the user/group that runs Haraka has permission to
read these files otherwise Haraka will not be able to reload them if they
are changed in which case it will continue to use the cached values.

Advanced
========

If you need to read files outside of the config directory:

```javascript
var configfile = require('./configfile');
var cfg = configfile.read_config('/path/to/file', type);
```

`read_config()` handles the caching for you and will return cached values
if there have been no updates since the file was read.

You can also optionally pass in a callback that is run if the file is 
updated:

```javascript
var cfg = configfile.read_config('/path/to/file', type, function() {
    // Code to run if file is updated
});
```

