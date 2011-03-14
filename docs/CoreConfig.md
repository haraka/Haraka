Core Configuration Files
========================

The Haraka core reads some configuration files to determine a few actions:

* loglevel

  Can contain either a number or a string. See the top of logger.js for the
different levels available.

* databytes

  Contains the maximum SIZE of an email that Haraka will receive.

* plugins

  The list of plugins to load

* smtp.ini

  Keys:
  
  * port - the port to use (default: 25)
  * listen\_address - default: 0.0.0.0 (i.e. all addresses)
  * inactivity\_time - how long to let clients idle

* early\_talker\_delay

  If clients talk early we *punish* them with a delay of this many milliseconds
  default: 1000.

