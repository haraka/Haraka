Config Files
============

Haraka contains a flexible config loader which can load a few different types
of configuration files.

The API is fairly simple:

    // From within a plugin:
    var config_item = this.config.get(name, [type], [callback], [options]);

Type can be one of:

* 'value' - load a flat file containing a single value (default)
* 'ini' - load an "ini" style file
* 'json' - load a json file
* 'list' - load a flat file containing a list of values
* 'data' - load a flat file containing a list of values, keeping comments and whitespace.

The name is not a filename, but a name in the config/ directory. For example:

    var config_item = this.config.get('rambling.paths', 'list');

This will load the file config/rambling.paths in the Haraka directory.

If your ini and json files have `.ini` and `.json` suffixes,
the `type` parameter can be omitted.

You can optionally pass in a callback function which will be called when
an update is detected on the file.

For ini files, an `options` object is allowed.

File Formats
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

