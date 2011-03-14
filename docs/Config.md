Config Files
============

Haraka contains a flexible config loader which can load a few different types
of configuration files.

The API is fairly simple:

    // From within a plugin:
    var config_item = this.config.get(name, [type='value']);

Where type can be one of:

* 'ini' - load an "ini" style file
* 'value' - load a flat file containing a single value (default)
* 'list' - load a flat file containing a list of values

The name is not a filename, but a name in the config/ directory. For example:

    var config_item = this.config.get('rambling.paths', 'list');

This will look up and load the file config/rambling.paths in the Haraka
directory.

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

Flat Files
----------

Flat files are simply either lists of values separated by \n or a single
value in a file on its own. Those who have used qmail or qpsmtpd will be
familiar with this format.

Lines starting with '#' and blank lines will be ignored.

See plugins/dnsbl.js for an example.

Reloading/Caching
========

Haraka automatically reloads configuration files, but this will only help if
whatever is looking at that config re-calls config.get() to re-access the 
configuration file after it has changed. Configuration files are watched for
changes so this process is not a heavyweight "poll" process, and files are
not re-read every time config.get() is called so this can be considered a
lightweight process.
