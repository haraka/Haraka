dnswl
=====

This plugin looks up the connecting IP address in an IP whitelist.
If the host is listed, then the plugin will return OK for all hooks
up to hook\_data.

IMPORTANT!  The order of plugins in config/plugins is important when
this plugin is used.  It should be listed *before* any plugins that
you wish to skip, but after any plugins that accept recipients.

Configuration
-------------

This plugins uses the following files:

dnswl.zones - Contains a list of zones to query, one per line.

dnswl.ini - INI format with options described below:

* zones       

    A comma or semi-colon list of zones to query.  It will be merged with
    any lists in dnswl.zones.

* periodic\_checks  

    If enabled, this will check all the zones every n minutes.
    The minimum value that will be accepted here is 5.  Any value less
    than 5 will cause the checks to be run at start-up only.
      
    The checks confirm that the list is responding and that it is not
    listing the world.  If any errors are detected, then the zone is 
    disabled and will be re-checked on the next test.  If a zone 
    subsequently starts working correctly then it will be re-enabled.

* enable\_stats

    To use this feature you must have installed the 'redis' module and
    have a redis server running.
      
    When enabled, this will record several list statistics to redis.
      
    It will track the total number of queries (TOTAL) and the average
    response time (AVG\_RT) and the return type (e.g. LISTED or ERROR) 
    to a redis hash where the key is 'dns-list-stat:zone' and the hash 
    field is the response type.
      
    It will also track the positive response overlap between the lists
    in another redis hash where the key is 'dns-list-overlap:zone' and
    the hash field is the other list names.

    Example:
    <pre><code>redis 127.0.0.1:6379> hgetall dns-list-stat:zen.spamhaus.org
    1) "TOTAL"
    2) "23"
    3) "ENOTFOUND"
    4) "11"
    5) "LISTED"
    6) "12"
    7) "AVG_RT"
    8) "45.5"
    redis 127.0.0.1:6379> hgetall dns-list-overlap:zen.spamhaus.org
    1) "b.barracudacentral.org"
    2) "1"
    3) "bl.spamcop.net"
    4) "1"
    5) "TOTAL"
    6) "1"
    </code></pre>

* stats\_redis\_host

    In the form of `host:port` this option allows you to specify a different
    host on which redis runs.
