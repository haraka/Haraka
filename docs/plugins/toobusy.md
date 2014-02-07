toobusy
=======

This plugin will stop Haraka accepting new connections when the event loop 
latency is too high.

See https://github.com/lloyd/node-toobusy for details.

To use this plugin you have to install the 'toobusy' module by running
'npm install toobusy' in your Haraka configuration directory.

This plugin should be listed at the top of your config/plugins file so that 
it runs before any other plugin that hooks lookup\_rdns.

Configuration
-------------

If you wish to override the default maxLag value of 70ms then add the desired
value to config/toobusy.maxlag.  This can be set and changed at runtime and
no restart is required.

Note that if you set the maxLag value to <10 then this will cause the toobusy
module to raise an exception which will cause Haraka to stop.
