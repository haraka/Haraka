process\_title
=============

This plugin causes the process title seen by the UNIX 'ps' command to
be modified from this:

```
19281 ?        Sl     0:00 node haraka.js -c /etc/haraka
```

to this:

```
28841 ?        Ssl    0:21 Haraka (master) cn=77 cc=1 cps=0/0.09/2
28843 ?        Sl     0:48  \_ Haraka (worker) cn=35 cc=0 cps=0/0.04/4 out=12/0/102                           
28845 ?        Sl     0:48  \_ Haraka (worker) cn=42 cc=1 cps=0/0.05/6 out=9/0/193
```

where:

* cn = Total number of connections
* cc = Total number of concurrent connections
* cps = Number of connections in the last second / average / maximum
* msgs = Total number of messages
* mps = Number of messages in the last second / average / maximum
* out = Mails being processed / Mails waiting to be processed / Mails in temp fail state
* respawn = Number of worker processes respawned (only under cluster)

If 'cluster' is used then the master process will show the total
across all workers, with the exception of outbound stats.

All of the counts shown are since the process started, so if a 
worker has been re-started then the counts may not add up.

Note: this plugin will only work on node >= 0.8 and should be
added at the top of config/plugins to ensure that it functions
correctly.
