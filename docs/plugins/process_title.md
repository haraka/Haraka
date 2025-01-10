# process\_title

This plugin causes the process title seen by the UNIX 'ps' command to
be modified from this:

```
node haraka.js -c /etc/haraka
```

to this:

```
Haraka (master) cn=11148 cc=1082 cps=21/25.24/79 rcpts=144950/1.84 rps=518/328.18/586 msgs=78815/7.07 mps=302/178.44/329 out=0/0/0 respawn=0 
 \_ Haraka (worker) cn=1646 cc=140 cps=5/3.73/17 rcpts=20310/1.86 rps=75/46.04/102 msgs=10938/6.65 mps=42/24.8/56 out=0/0/0 
 \_ Haraka (worker) cn=1563 cc=168 cps=3/3.54/18 rcpts=19844/1.87 rps=78/45/96 msgs=10627/6.8 mps=49/24.1/53 out=0/0/0 
 \_ Haraka (worker) cn=1852 cc=172 cps=3/4.2/16 rcpts=26278/2.03 rps=93/59.56/114 msgs=12938/6.99 mps=40/29.33/65 out=0/0/0 
 \_ Haraka (worker) cn=1704 cc=187 cps=5/3.86/14 rcpts=23688/1.84 rps=93/53.7/125 msgs=12886/7.56 mps=64/29.21/66 out=0/0/0 
 \_ Haraka (worker) cn=2296 cc=218 cps=2/5.2/20 rcpts=29300/1.78 rps=117/66.4/125 msgs=16489/7.18 mps=40/37.37/66 out=0/0/0 
 \_ Haraka (worker) cn=2091 cc=195 cps=4/4.74/16 rcpts=25646/1.71 rps=84/58.12/117 msgs=14982/7.16 mps=52/33.95/66 out=0/0/0 
```

where:

* cn = Total number of connections
* cc = Total number of concurrent connections
* cps = Number of connections in the last second / average / maximum
* rcpts = Total number of recipients / Average number of recipients per message
* rps = Number of recipients in the last second / average / maximum
* msgs = Total number of messages / Average number messages per connection
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
