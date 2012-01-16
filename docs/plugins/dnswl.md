dnswl
=====

This plugin looks up the connecting IP address in an IP whitelist.
If the host is listed, then the plugin will return OK for all hooks
up to hook_data.

IMPORTANT!  The order of plugins in config/plugins is important when
this plugin is used.  It should be listed *before* any plugins that
you wish to skip, but after any plugins that accept recipients.

Configuration
-------------

* dnswl.zones

  A list of zones to query.

* dnswl.periodic_checks

  Tests the zones at start-up and every 5 minutes to make sure they are
  responding correctly to test point, is not timing out and is not listing 
  the world. If any errors are detected, then the zone is disabled and will 
  be re-checked on the next test.  If a zone subsequently starts working
  correctly, then it will be re-enabled.
