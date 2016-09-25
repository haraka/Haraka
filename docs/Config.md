Config Files
============

Haraka's config loader can load several types of configuration files.

The API is fairly simple:

    // From within a plugin:
    var cfg = this.config.get(name, [type], [callback], [options]);

`name` is not a full path, but a filename in the config/ directory. For example:

    var cfg = this.config.get('rambling.paths', 'list');

This will load the file config/rambling.paths in the Haraka directory.

`type` can be one of:

* 'value' - load a flat file containing a single value (default)
* 'ini'   - load an ini file
* 'json'  - load a json file
* 'yaml'  - load a yaml file
* 'list'  - load a flat file containing a list of values
* 'data'  - load a flat file containing a list of values, keeping comments and whitespace.
* 'binary' - load a binary file into a Buffer

If your ini and json files have `.ini`, `.json` or `.yaml` suffixes,
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
    plugin.loginfo('register function called');
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

* `no_watch` (default: false) - prevents Haraka from watching for updates.
* `no_cache` (default: false) - prevents Haraka from caching the file. This
means that the file will be re-read on every call to `config.get`.  This is
not recommended as config files are read syncronously, will block the event
loop, and will slow down Haraka.
* `booleans` (default: none) - for .ini files, this allows specifying
boolean type keys. Default true or false can be specified.

<a name="overrides">Default Config and Overrides</a>
===========

The config loader supports dual config files - a file containing default
values, and overridden values installed by a user. This can be useful if
publishing your plugin to npm (and is used by some core plugins).

Overrides work in the following manner:

* For `json`, `ini` and `yaml` config, values are overridden on a deep
key by key basis.
* For every other config format, an override file replaces the entire
config.

So for example, a plugin installed as a module (or a core Haraka plugin)
that loads a `list` config from their own `config/plugin_name` file, can
be completely overridden by a file called `config/plugin_name` in your
local Haraka installation directory.

Alternatively, a plugin using default config from `config/plugin_name.ini`
can be overridden on a key-by-key basis, so for example a default
`plugin_name.ini` might contain:

```
toplevel1=foo
toplevel2=bar

[subsection]
sub1=something
```

And your local `plugin_name.ini` might contain:

```
toplevel2=blee

[subsection]
sub2=otherthing
```

This would be the equivalent of loading config containing:

```
toplevel1=foo
toplevel2=blee

[subsection]
sub1=something
sub2=otherthing
```

This allows plugins to provide default config, and allow users to override
values on a key-by-key basis.

<a name="file_formats">File Formats</a>
============

Ini Files
---------

INI files have their heritage in early versions of Microsoft Windows.
Entries are a simple format of key=value pairs, with optional [sections].

Here is a typical example:

    first_name=Matt
    last_name=Sergeant
    
    [job]
    title=Senior Principal Software Engineer
    role=Architect

    [projects]
    haraka
    qpsmtpd
    spamassassin

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
    },
    projects: {
        haraka: undefined,
        qpsmtpd: undefined,
        spamassassin: undefined,
    }
}
````

Items before any [section] marker are in the implicit [main] section.

There is some auto-conversion of values on the right hand side of
the equals: integers are converted to integers, floats are converted to
floats.

The key=value pairs support continuation lines using the
backslash "\" character.

The `options` object allows you to specify which keys are boolean:

    { booleans: ['reject','some_true_value'] }

On the options declarations, key names are formatted as section.key.
If the key name does not specify a section, it is presumed to be [main].

This ensures these values are converted to true Javascript booleans when parsed,
and supports the following options for boolean values:

    true, yes, ok, enabled, on, 1

Anything else is treated as false.

To default a boolean as true (when the key is undefined or the config file is
missing), prefix the key with +:

    { booleans: [ '+reject' ] }

For completeness the inverse is also allowed:

    { booleans: [ '-reject' ] }

Lists are supported using this syntax:

    hosts[] = first_host
    hosts[] = second_host
    hosts[] = third_host

which produces this javascript array:

    ['first_host', 'second_host', 'third_host']


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

If a requested .json file does not exist then the same file will be checked
for with a .yaml extension and that will be loaded instead.   This is done
because YAML files are far easier for a human to write.

You can use JSON or YAML files to override any other file by prefixing the
outer variable name with a `!` e.g.

``````
{
    "!smtpgreeting": [ 'this is line one', 'this is line two' ]
}
`````

If the config/smtpgreeting file did not exist, then this value would replace
it.

NOTE: You must ensure that the data type (e.g. Object, Array or String) for 
the replaced value is correct.  This cannot be done automatically.

YAML Files
----------

As per JSON files above but in YAML format.


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

