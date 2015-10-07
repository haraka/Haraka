graph
=====

This plugin logs accepted and rejected emails into a database and provides
a web server which you can browse to and view graphs over time of the
plugins which rejected connections.

In order for this to work you need to install the `sqlite3` module via
`npm install sqlite3` in your Haraka directory.

Configuration
-------------

config settings are stored in config/graph.ini

* db\_file

  The file name (or :memory:), where data is stored

* http\_addr

  The IP address to listen on for http. Default: `127.0.0.1`.

* http\_port

  The port to listen on for http. Default: `8080`.

* ignore\_re

  Regular expression to match plugins to ignore for logging.
  Default: `queue|graph|relay`
