graph
=====

This plugin logs accepted and rejected emails into a database and provides
a web server which you can browse to and view graphs over time of the
plugins which rejected connections.

In order for this to work you need to install the `sqlite` module via
`npm install sqlite` in your Haraka directory.

Configuration
-------------

* grapher.http_port

  The port to listen on for http. Default: `8080`.

* grapher.ignore_re

  Regular expression to match plugins to ignore for logging.
  Default: `queue|graph|relay`
