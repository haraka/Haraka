daemonize
=========

IMPORTANT NOTE: This plugin should not be used any more and it will 
throw an error and prevent Haraka from starting.  
Daemonization is now built into Haraka.  If the 'daemon' module is
installed you simply set daemonize=true in config/smtp.ini now.

To use this plugin you have to install the 'daemon' module by running 
'npm install daemon' in your Haraka configuration directory.  
If daemon is not found then the plugin will log a notice and Haraka will 
continue running in the foreground.

This plugin should be listed at the top of your config/plugins file so that 
Haraka goes into the background before any other plugins are run.

Configuration
-------------

This plugin looks for daemonize.ini in your configuration directory and the 
following options can be set:

- log\_file  (default: /var/log/haraka.log)

    The file that STDOUT should be redirected to.  It is recommended that 
    you use this plugin with the log.syslog plugin instead.

- pid\_file  (default: /var/run/haraka.pid)

    File where the master process PID should be written to.  If this file 
    cannot be locked then start-up will fail.

Init-Script
-----------

A RedHat/CentOS compatible init-script is provided for use with this module 
which can be found in the plugins directory called haraka.init.  
It should be copied to /etc/init.d/haraka and registered with 
'chkconfig --add haraka' to activate haraka at system boot.

The init-script presumes that Haraka is installed as /usr/local/bin/haraka 
and main configuration file is /etc/haraka/config/smtp.ini.  
If this is not the case on your system, then you should create the file 
/etc/sysconfig/haraka which accepts the following configuration:

- exec  (default: exec=/usr/local/bin/haraka)

    The path to Haraka script

- config  (default: config=/etc/haraka/config/smtp.ini)

    The path to the Haraka smtp.ini configuration script

- max\_open\_files  (default: 65535)

    The maximum number of open files allowed per process.  If you are 
    running Haraka using the 'cluster' module, then this is the per-child 
    limit.

