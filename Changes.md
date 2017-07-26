
## 2.8.14 - Jul 26, 2017

* Changes
    * Fix auth plugin failure when re-selecting auth method #2000
    * don't crash Haraka when invalid YAML config encountered #2013
    * update semver to version 5.4.0 #2015
    * relay docs: correct the config file name #2012
    * rename config/xclient.hosts to match plugin & docs #2014
    * build_todo() is part of the outbound/index.js api #2016
    * update js-yaml to version 3.9.0 #2002
    * outbound/hmail: use WRITE_EXCL from haraka-constants #2011
    * replace plugins/log.elasticsearch with npm packaged #2004
    * Remove two spurious log statements #1989
    * access: rebuild blacklist upon change (vs supplement) #1990
    * deliver to qmail-queue with LF line endings (not CRLF) #1997
    * doc: add note that smtp_forward only supports STARTTLS #1988
    * import Plugins.md from v3 #1991
    * update async to 2.5.0 #1982
    * update iconv to 2.3.0 #1981
    * require node.js v6+ #1958
    * update ipaddr.js to 1.4.0 #1972
    * support newer address-rfc2822 #1970
    * update node-address-rfc2821 version to 1.1.1 #1968
    * outbound: be consistent with todo.domain #1960
    * bump haraka-results required version #1949
    * logger: load in a setImmediate call #1948
    * logger: strip intermediate \n chars #1947
    * tls consistency cleanups #1851
    * Get pool config handling simplifcation #1868
        * add integration test: send message w/smtp_client
    * replace some legacy code with es6 #1862
    * update async to version 2.2.0 #1863
    * update ipaddr.js to version 1.3.0 #1857
    * update redis to version 2.7.0 #1854
    * assure conn/tran still exists before storing results #1849
    * moved tls.ini parsing to net_utils #1848
    * smtp forward dest split routing #1847
    * rspamd: refactor complex condition into function #1840
    * block js attachments #1837
    * helo.checks: bring plugin into alignment with docs #1833
    * when proxy enabled, update remote.is_private too #1811
    * create an outbound queue filename handler #1792
    * replace connect.fcrdns with npm package #1810
    * add an additional node_modules plugin search path #1805
    * Set graceful shutdown off by default #1927
    * Allow outbound pools to be disabled #1917
    * Outbound split and move into folder #1850
    * don't emit binary characters into the logs #1902
    * Add .editorconfig #1884
    * tls: remove interim variables #1871
* New Features
    * Use punycode domain (support SMTPUTF8) #1944
    * Added RabbitMQ vhost support #1866
    * clamav: allow "Unknown Result" and Socket Error to try next host #1931
    * outbound client certificates #1908
    * Implement the missing upgrade method on SMTPClient #1901
    * Remove typo from relay.md #1886
* Fixes
    * outbound: fix queue not loaded for single process #1941
    * outbound: Fix undefined variable platformDOT in hmail.js #1943
    * outbound: fix undefined FsyncWriteStream var #1953
    * Fix cluster messaging for node v6+ #1938
    * outbound: fix loading under cluster. #1934
    * Check pool exists before delete #1937
    * be more strict in attachment filename matching #1957
    * doc typo fix #1963
    * RabbitMQ: fix encoding of user and password string #1964
    * spf: improve modifier regexp #1859
    * rabbitmq doc typo in config file name #1865
    * URL to manual was 404, point to Plugins.md #1844
    * smtp_client: set idleTimeout to 1s < pool_timeout #1842
    * fix broken continuations #1843
    * doc error for the 'check.authenticated' setting in rspamd plugin #1834
    * emit _the_ result, not all of them #1829
    * fix outbound logger #1827
    * fix forwarding with client auth over TLS (forward to gmail) #1803
    * Don't blow the stack on qstat #1930
    * run dumped logs through log plugins, not console #1929
    * Fix path parsing bug on Windows platform #1919
    * helo: make sure list_re is defined before access #1903
    * TLS: handle case where OCSP server is unavailable #1880
    * rspamd: add missing 'default' keyword #1856
    * disable naïve comment stripping #1876

## 2.8.13 - Feb 03, 2017

* Changes
    * new [haraka-plugin-limit](https://github.com/haraka/haraka-plugin-limit) #1785
        * replaces plugin/limit, plugin/rate_limit, and haraka-plugin-outbound-rate-limit
    * p0f: skip on private IPs (normally empty) #1758
    * spf: skip for outbound when context != myself #1763
    * redis: plugins using redis can inherit redis config #1777
    * redis: replace plugins/redis with haraka-plugin-redis #1786
    * lint: require space before function declaration #1784
    * lint: added eslint:recommended #1790
    * logger: remove logger.colorize code for legacy node versions
* New Features
    * redis: add `redis_subscribe_pattern()` #1766
    * queue/discard: add ENV that permits discarding #1791
* Improvements
    * rspamd: improve response parsing #1770
    * restore Windows testing to working state #1755
    * elasticsearch: use UTC dates for index creation #1771
    * tls: fix dhparam usage example syntax #1774
    * typo: logerr -> logerror #1776
    * when generating long DKIM keys, include a BIND compatible folded key #1775
    * in haraka-test-fixtures, access results via fixtures.results #1783
    * integration test: end to end server testing #1791
* Bug Fixes
    * spf: restore functionality for relay context=myself #1759
    * rate_limit:if incr creates a new record, assure it has a TTL #1781
    * tls: do not create a top level secureContext #1787
    * dnswl: swap lines to fix missing inherited methods #1793
    * dnswl: fix config loader callback syntax #1794
    * tests/plugins: unset process.env.HARAKA to avoid side effects that interfere with other tests
    * remove auth_flat_file sample auth user #1796


## 2.8.12 - Jan 03, 2017

* Changes
    * plugin/karma -> npm packaged haraka-plugin-karma #1747
    * update generic-pool 2.4.2 -> 2.5.0
* New Features
    * Added option to bypass SpamAssassin headers' merge #1745
* Improvements
    * reduce severity of debug message #1744
    * fix misleading entries in config/tls.ini #1734
    * Misc. performance improvements #1738
    * set tls.sessionIdContext property (for Thunderbird compat) #1740
* Bug Fixes
    * Swap lines to avoid clobbering response array #1743


## 2.8.11 - Nov 24, 2016

* Changes
    * rename core_require to haraka_require #1708
    * move log.syslog to haraka-plugin-syslog #1698
    * remove tls.ini loading and is_no_tls_host to net_utils #1690
    * replace ./utils with npm packaged haraka-utils #1720
    * require node 4
    * karma: add .top TLD scoring #1714

* New Features
    * Implement OCSP Stapling #1724

* Improvements
    * show help for npm packaged plugins included in core #1698
    * use tls.connect for client #1682
    * bring port 465 SMTPS TLS config support on par with STARTTLS #1667
    * use tls.connect instead of createSecurePair #1678
    * redis: improve error handling in tests #
    * replace / path seperators with path.\* for cross platform compat #1713

* Bug Fixes
    * dkim_sign: per-domain key finding fixed #1707
    * Rspamd: restore spam report header #1702
    * auth/vpopmail: do not toString() when null #1695
    * fix outbound to avoid recursive reading key/cert after refactoring #1692
    * tls: fix option servername (not hostname) #1728
    * correct Auth-Results cleaning #1726
    * fix results for connection.remote_host and NXDOMAIN #1716


## 2.8.10 - Oct 20, 2016

* Changes
    * use standard npm syntax for lint and tests #1646
    * remove ./net_utils to haraka-net-utils #1644
    * remove incorrect and unused spf.hello_host #1635
    * remove rogue DENYSOFT copy-pasta error #1634
    * update async to v2 #1545
    * remove plugin/dir support from base haraka #1668
        * use node_modules_dir support instead
    * use TLSSocket instead of createSecurePair #1672
    * refactor plugins/tls #1670
    * moved watch plugin to npm as haraka-plugin-watch #1657
    * normalize proxy properties #1650

* New Features
    * added connection.remote.is_private boolean #1648
    * added additional TLS options (@typingArtist) #1651
    * added wildcard boolean support to config loader #1680
    * tls: allow multiple key and cert parameters for RSA+ECDSA #1663
    * permit specifying haraka plugins w/o haraka-plugin- prefix #1645
        * in config/plugins and resultstore

* Improvements
    * connection.geoip replaced by haraka-plugin-geoip #1645
    * connection.asn replaced by haraka-plugin-asn #1645
    * permit specifying npm packaged plugins w/o haraka-plugin prefix #1647
    * normalized connection properties #1547, #1577
    * Rspamd: fix spambar for negative scores #1630
    * set connection.remote.is_private early
        * replace calls to net_utils with remote.is_private test

* Bug Fixes
    * Tidy-up graceful shutdown and fix for non-cluster mode #1639
    * Fix data.headers plugin crash #1641
    * Fix access plugin crash #1640
    * Minor DKIM fix #1642
    * do not set TLS timer if timeout=0 #1632
    * do not overwrite config/host_list on install #1637
    * correct smtp_forward cfg for multiple rcpts #1680
    * fix TLS timeout errors #1665


## 2.8.9 - Oct 02, 2016

* Changes

* New Features
    * Support outbound.pool_timeout of 0 to effectively disable pooling. #1561
    * Added never_add_headers option to rspamd plugin. #1562
    * rcpt_to.routes URI format w/ LMTP support #1568

* Improvements
    * The delay_deny plugin now has a whitelist mode (vs blacklist). #1564
    * Don't show the private key in logs for dkim_sign. #1565
    * update geoip for compat with newer ES (#1622)
    * drop node 0.10 testing / official support (#1621)
    * watch plugin displays UUIDs as URL (#1624)
    * Catch errors on header decode in rfc2231 #1599
    * Attachment plugin updates (#1606)
    * add outbound.ini pool_timeout example setting #1584

* Bug Fixes
    * Fixed some small documentation issues. #1573, #1616, #1612
    * Fixed AUTH PLAIN when it spreads over two lines. #1550
    * Fixed dkim_verify calling next() too soon. #1566
    * Fixed bugs with outbound pools who shutdown before we QUIT. #1561, #1572
    * outbound issues #1615, #1603
    * Fixed adding/removing headers in rspamd plugin. #1562
    * Fixed process_title not shutting down. #1560
    * fix a spurious error emitted by p0f (#1623)
    * fix header version hiding (#1617)
    * messagestream returns destination (#1610)
    * plugins.getdenyfn now passed 3rd params arg (#1591)
    * Fix scope of spf logdebug (#1598)
    * fix rabbitmq deliveryMode bug (#1594)
    * fix dkim_sign TypeError with null mail_from.host (#1592)
    * fix dkim_sign attempting to lower an undefined (#1587)

## 2.8.8 - Jul 20, 2016

* Changes
    * removed UPGRADE.doc to [wiki](https://github.com/haraka/Haraka/wiki/Upgrade-Haraka)

* Improvements
    * support + wildcard in aliases plugin #1531
    * Support dkim_sign with outbound.send_email() #1512
    * spf: always check remote IP, then public IP if != pass #1528
    * spf: diplay IP used for SPF eval #1528

* Bug Fixes
    * handle missing wss section in http.ini #1542
    * fix leak on socket write error #1541
    * add results property to outbound transaction #1535
    * don't unref unref'd wss server #1521

## 2.8.7 - Jun 18, 2016

* Changes
    * Fix geoip test

* Improvements
    * Allow alias plugin to explode to a list of aliases
    * Support IPv6 literals in HELO tests (#1507 thanks @gramakri)
    * Make ldap plugin use the modified address if a rcpt hook
      changes it (#1501 thanks @darkpixel)

* Bug Fixes
    * Fix loading plugins as npm modules (#1513)
    * More DKIM fixes (#1506 thanks @zllovesuki)
    * Fix the long failing host-pool-timer test (#1508)
    * Fix clean shutdown of redis with new shutdown code
      (#1504 and #1502 thanks @darkpixel)
    * More fixes to clean shutdown (#1503)

## 2.8.6 - Jun 06, 2016

* Bug Fixes
    * Fix loading under Node v4 which sends a blank message
    * Fix quit (SIGINT) when running without nodes=

## 2.8.5 - Jun 04, 2016

* Changes
    * The connection object is now passed to `get_plain_passwd`. Older
      modules should continue to work as-is.
    * The reseed_rng plugin now just uses the Crypto module from core.
      Though it seems this plugin should be irrelevant with newer versions
      of node.js

* New Features
    * Outbound mail now uses pooled connections, only sending a `QUIT`
      message if the connection has been idle for a while.

* Improvements
    * Shut down and reload (via `haraka -c <path> --graceful`) is now
      graceful - allowing current connections to finish and plugins
      to clean up before ending.

* Bug Fixes
    * Bind maxmind version to ignore API change (#1492)
    * Fix encodings when banners are used (#1477)
    * Various DKIM fixes (#1495)

## 2.8.4 - May 24, 2016

* Bug Fixes
    * Fix plugin loading override when installed (#1471)

## 2.8.3 - May 18, 2016

* Bug Fixes
    * Fix config overriding for core modules (#1468)

## 2.8.2 - May 17, 2016

* Changes
    * Added Node v6 to travis tests

* New Features
    * Added bin/haraka --qunstick <domain> to flush all mails
      for that domain (#1460)

* Improvements
    * Make bin/haraka --qlist show much more information (#1452)
    * Allow CIDR ranges in no_tls_hosts (#1450)

* Bug Fixes
    * 2.8.0 was shipped with a broken config/plugins. (#1453)
    * Stop haraka dying when ldap connections fail (#1456)
    * Pick up domain specific config correctly in ldap (#1456)

## 2.8.0 - May 06, 2016

* Changes
    * updated dependency versions (#1426, #1425)
    * use utf8 encoding for body filters (#1429)
    * remove spameatingmonkey from tests (#1421)
    * replace ./constants.js with haraka-constants (#1353)
    * Document HMail and TODO items (#1343)
    * Copy only a minimal config/\* by default (#1341).
    * cfreader/\* removed to haraka/haraka-config (#1350)
    * outbound and smtp_client honor tls.ini settings (#1350)
    * outbound TLS defaults to enabled
    * lint: remove all unused variables (#1358)
    * replace ./address.js with address-rfc2181 (#1359)

* New Features
    * smtp_forward: accepts a list of backend hosts, thanks @kgeoss (#1333)
    * config: add array[] syntax to INI files (#1345)
    * plugins.js: support require('./config') in plugins
    * Load plugin config from own folder and merge (#1335)
    * Allow original email's Subject to be included in bounce message (#1337)
    * new queue/smtp_bridge plugin, thanks @jesucarr (#1351)

* Improvements
    * early_talker: supports IP whitelisting (#1423)
    * loading plugins as packages (#1278)
    * removed TLD stuff to haraka/haraka-tld (#1301)
    * removed unused 'require('redis') in plugins/karma (#1348)
    * improved MIME header support per rfc2231 (#1344)
    * tls options can be defined for outbound and smtp\_\* (#1357) 
    * explicitly disable SSLv2 (#1395)
    * cache STUN results
    * xclient plugin improvements (#1405)
    * tls: Set verify=NO correctly when no certificate presented (#1400)
    * improved message header decoding (#1403, #1406)
    * bounce: skip single_recipient check for relays/private_ips (#1385)
    * rspamd docs: Clarify usage of check.private_ip (#1383)
    * if rcpt_to returns DSN in msg, log it properly (#1375)

* Bug Fixes
    * fix out-of-range errors from banner insertion (#1334)
    * dkim_verify: Call next only after message_stream ended (#1330)
    * outbound: remove type check from pid match (#1322)
    * lint: enable no-shadown and remove all shadow variables (#1349)
    * spf: fix log_debug syntax (#1416)
    * auto_proxy: fix a starttls loop (#1392)
    * fcrdns: corrected err variable name (#1391)
    * rspamd: Fix undefined variable (#1396)
    * dkim_verify: Fix header handling (#1371)
    * smtp_client: fix remote_ip (#1362)


## 2.7.3 - Feb 04, 2016

* Changes
    * smtp_proxy & qmail-queue: default to enabled for outbound deliveries
      (previously used Outbound), to better matches user expectations.

* New Features
    * outbound: allow passing notes to send_email (#1295)

* Improvements
    * logging: emit log message queue before shutting down (#1296)
    * result_store: permit redis pub/sub to work when host != localhost (#1277)
    * tests: quiet the extremely verbose messages (#1282)
    * rspamd: add timeout error handling (#1276)
    * watch: fix display of early_talker results (#1281)
    * spamassassin: publish results to result_store (#1280)
    * karma: can now connect to redis on hosts other than localhost (#1275)
    * geoip & p0f: don't log empty/null values from RFC 1918 connects (#1267)
    * redis: make plugin params match docs (#1273)
    * mailbody: small refactoring (#1315)
    * smtp_proxy & qmail-queue: default to enabled for outbound (#1308)

* Bug Fixes
    * redis: use correct path for db.select (#1273)
    * count errors correctly (#1274)
    * logger: ignore null arguments (#1299)
    * connection: pause for hook_reset_transaction (#1303)
    * rcpt_to.routes: update redis usage for compat with redis plugin (#1302)
    * smtp_forward: use correct config path to auth settings (#1327)
    * messagestream: correctly pass options parameter to get_data (#1316) 
    * spf: honour configuration for mfrom scope (#1322)
    * outbound: Add missing dash to 'Final-Recipient' header name (#1320)


## 2.7.2 - Dec 15, 2015

* Bug Fixes
    * Revert a change that broke plugin loading


## 2.7.1 - Dec 14, 2015

* New Features
    * added debian init.d file (#1255) @slattery

* Improvements
    * smtp_forward auth settings now work (#430)
    * better handling of broken messages (#1234)
    * Docker: use latest Phusion image && stdout (#1238, #1239)
    * Clean up plugin loading a tiny bit (#1242)
    * make dkim keydir case insensitive (1251)
    * ignore DNS errors that aren't errors (#1247)
    * outbound doc updates (#1258) @Currerius
    * outbound: return DENYSOFT on queue error (#1264)
    * smtp_client: if enable_tls is set and TLS files missing, warn (#1266)

* Bug Fixes
    * Don't sent empty headers to rspamd (#1230)
    * Fix auth_base.js key need to be a string - number.toString() (#1228)
    * fix bug with empty charset= on mime parts … (#1225)
    * Fix "passwd" check crash with numeric password. (#1254)
    * result_store: show arrays when not empty (#1261)


## 2.7.0 - Oct 07, 2015

* New Features
    * SPF bounce check
    * rspamd plugin (@fatalbanana)
    * watch plugin
    * limit plugin (connection concurrency, errors, unrecognized commands)
    * plugins can now be npm packages (see also #946)
    * built-in HTTP server (Express backed)
    * ESETS AV plugin
    * DCC plugin (incomplete)
    * Add LOGIN support to XCLIENT
    * backscatterer plugin
    * full IPv4 & IPv6 compatibility inbound #1120, #1123, #1154 (@Dexus)
    * Early talker #1075 (@smfreegard, @msimerson)
    * permit loading of plugins in node_modules #1056 (@msimerson)

* Improvements
    * Fix anti_spoof by use config #1171
    * Add license clause #1170
    * package.json dependencies and travis update #1147, #1168 (@Dexus)
    * logging: remove node-syslog and strong-fork-syslog with modern-syslog #1145 (@Dexus)
    * aliases: support for email, user and host aliases #1149 (@Dexus)
    * add docs for use private key with TLS #1130 (@Dexus)
    * outbound: ENOENT on dotfile - compatibility for windows #1129 (@Dexus)
    * plugin/attachment: block more attachment file types #1191 (@Dexus)
    * remove double functions #1126 (@Dexus)
    * Outbound Bounce messages according to RFC3464 #1189 (@hatsebutz)
    * toobusy: only run checks if toobusy.js installed and loads
    * HAProxy: set local_ip, local_port and remote_port
    * save auth pass/fail/user to result_store
    * ini files no longer require values (useful for storing lists)
    * connection: add MAIL and RCPT to results
    * results_store: enable 'emit' feature for .push()
    * add support for custom Outbound Received header value (@zombified)
    * save smtp_forward result to result_store
    * auth_base: permit a return message (@DarkSorrow)
    * add DSN.create() and RFC 4954 support
    * enhanced pipelining support
    * added config/access.domains with some tips (@EyePulp)
    * Add SSL detection over plain-text socket
    * earlytalker: store results
    * bounce: make it safe to check non_local_msgid
    * AVG: store results, added defer options
    * tls: change createCredentials to tls.createSecureContext (@DarkSorrow)
    * update dependency versions (esp async 0.2.9 -> 1.0.0)
    * ASN docs: add FTP download note for routeviews
    * karma: removed concurrency limits (see limit plugin) and penalty feature
    * added utils.elapsed()
    * deny message includes hostname
    * Add Fisher-Yates shuffle to randomize lookup order in data.uribl
    * change default message size limit to 25mb
    * auth_base: save auth results
    * upgrade toobusy plugin to toobusy-js (@alexkavon)
    * configfile: permit / char in ini keys
    * added utils.node_min()
    * added result_store.get_all()
    * updated ubuntu upstart script
    * plugin/rate_limit: return in no custom default is set 0 = unlimited #1186, #1185
    * Outbound.send_email: added dot-stuffing #1176, #1165 (@hatsebutz)
    * make sure server object is availabe to plugins loaded from node_modules #1162 (@bmonty)
    * Net_utils.get_ips_by_host #1160 (@msimerson)
    * fcrdns: don't log error for ENODATA #1140 (@msimerson)
    * improve MUA detection #1137 (@msimerson)
    * tls: tmp disable for hosts that fail STARTTLS #1136 (@msimerson)
    * karma: skip deny on outbound hooks #1100 (@msimerson)
    * Store HAProxy IP in connection object #1097 (@smfreegard)
    * Remove UUID from queued message #1092 (@smfreegard)

* Bug Fixes
    * fix windows build and test failures #1076 (@msimerson)
    * Fix plugin ordering #1081 (@smfreegard)
    * Fix distance reporting to X-Haraka-GeoIP for geoip-lite #1086 (@smfreegard)
    * uribl: prevent calling next() more than 1x #1138 (@msimerson)
    * Fix so constants are imported when plugin is loaded from node_modules. #1133 (@bmonty)
    * Include STMP-code in bounce-reason string for upstream 5XX responses #1117 (@hatsebutz)
    * TLS fixes: add timed_out flag and karma should not run deny hook on it. #1109 (@smfreegard)
    * Fix port to number instead of string for HAProxy #1108 (@DarkSorrow)
    * Plugin dcc: fixed syntax error #1164 (@hatsebutz)
    * config: fix flat files if \r\n lines #1187 (@Dexus)
    * corrected hook_rcpt log code hook_rcpt_ok returns CONT
    * fix crash bug when loglevel = LOGDEBUG
    * corrected pathname in rcpt.ldap plugin (@abhas)
    * added helo.checks boolean for proto_mismatch
    * make rate_limit redis keys always expire @celesteking
    * dkim_sign: Buffer.concat expects an array of buffers
    * transaction: check discard_data before adding line end (@DarkSorrow)
    * fix 8-bit msg not displayed properly in gmail
    * fcrdns: always init results
    * TLS timer on error
    * dkim_verify: fixed timeout issue
    * smtp\_[proxy|forward]: correct authentication example
    * Fork child workers after init_master hook
    * connection: return 450/550 for plugin DENY\* (was 452/552)
    * spamassassin: don't call next() when transaction gone
    * outbound: fix crash when sending bounce mail
    * auth_base: fix bad protocol in auth_base.js #1121 (@Dexus)
    * outbound: Fix HELO/rDNS issue while using multiple outbound ip #1128 (@Dexus)
    * connection: Fix bug when client disconnect after sending data #1193
    * Fix connect.geoip bug #1144 (@smfreegard)
    * Fix tiny bug in messagesniffer #1198 (@smfreegard)

## 2.6.1 - Mar 27, 2015

* added sedation timers for config file re-reading
* Add AUTH support to outbound
* tests/spf: quiet excessive DEBUG noise
* allow domains with underscore
* correct name of domains config file in access
* Fix SMTP AUTH in smtp_forward/proxy and add docs
* Fix opts not being passed to HMailItem \_bounce function
* log.syslog will try strong-fork-syslog (for node 0.12 compat)
* improvements to Plugin docs
* rename net_utils.is_rfc1918 -> is_private_ip
    * IPv6 compat
    * test coverage
    * add IPv6 unique local fc00::/7
* pre-populated config/plugins
* added utils.extend, copies props onto objects

## 2.6.0 - Feb 21, 2015

* other bug fixes
* updated a few tests so test suite passes on Windows
* log.syslog: handle failure to load node-syslog
* plugin directory is $ENV definable (@martin1yness)
* logging timestamps were static, fixed by @cloudbuy
* queue/rabbitmq_amqplib, new plugin for RabbitMQ using amqplib (@esevece)
* outbound:
    * plugins can set the outbound IP (during get_mx)
    * only replace line endings if not \r\n
    * bannering fixes
    * added support for per recipient routes
* tls: don't register hooks upless certs exist
* removed contrib/geolite-mirror-simple.pl (replaced by
  docs update pointing to maxmind-geolite-mirror)
* rcpt.routes: new plugin by @msimerson
* make haproxy IPv6 compatible
* record_envelope_addresses: new plugin by @deburau
* prevent_credential_leaks: new plugin by @smfreegard
* config:
    * configfile: added .yaml support
    * improved config file 'watch' logic
    * Allow hyphens in params in config files (@abhas)
    * cached requests include options in cache key name
* asn: updates for node 0.11 compat
* dnsbl: use aysync.each vs forEach (avoid race condition)
* spamassassin: improved config loading and test coverage
* geoip: deprecate geoip-lite in favor of maxmind, IPv6 compatible
* disable SSLv3 (due to POODLE)
* dkim & spf, updates for node 0.11 compatibiilty
* karma: move neighbor scoring from code to karma.ini
    * move excludes list to karma.ini
    * apply awards before adding message header & permit rejection at queue
    * karma.ini: score updates for access & uribl plugins
    * score denials issued by skipped plugins
    * add scores for specific DNSBLs
* add transaction body filters (@chazomaticus)
    * change bannering to use them
* helo.checks: fix timeout bug
    * match_re now validates and pre-compiles all REs
    * Add new proto_mismatch check
* p0f: add register(), load config once, early
* server: improved config handling
* data.headers: add Delivered-To check
* rcpt_to.ldap: new plugin by @abhas
* smtp_client: only load tls_* when cfg.enable_tls
* added plugins/host_list_base
* Platform independent temp dir (thanks @martinvd)
* move deprecated docs into docs/deprecated
* Switch to Phusion baseimage instead of stock Ubuntu (thanks @Synchro)
* dkim_verify: new plugin by @smfreegard
* many new tests
* improved URI parser (for URIBL plugin)
* Allow mixed case STARTTLS command
* Install Node via package manager (Mohd Rozi)
* Fix a couple crit errors (@Illirgway)
* Add noisy/bulk out-of-band rule support to MessaageSniffer plugin
* initial support for rabbitmq plugin (@samuelharden)
* bounce, added non_local_msgid checks and much faster lookups
* vpopmail: fail faster during a CRAM-MD5 auth attempt with an invalid user
* fcrdns: handle a null hostname
* Improve HAProxy support code and documentation
* tls: reworked for efficiency and linear style
* access: test hostname validity before PSL lookup
    * load lists into objects (vs arrays), for much faster runtime access
* host_list: huge performance increase, esp for many hosts

## 2.5.0 - May 24, 2014

* added automated build testing via Travis-CI.org
* fixed dkim_sign crash issue #560
* geoip can discover external IP via net_utils.get_public_ip
* geoip: skip private IPs
* qmd: when relaying, validate MAIL FROM against QMD, add per-domain
  configurations, added reject option, added tests and bug fixes.
* net_utils: added is_ipv4_literal, is_public_suffix, get_public_ip, added
  tests, shed some CamelCase.
* asn: looksup up ASN of connection, uses 3 providers, tests providers, saves
  results, optionally adds headers. Includes tests.
* access: new plugin that merges rdns_access, mail_from.access, and
  rcpt_to.access.
* connect.fcrdns: new plugin (Forward Confirmed Reverse DNS)
* bounce: new plugin (merges
* data.headers: new plugin added direct_to_mx, check & reject settings, added MLM detection,
  tests.
* helo.checks: refactored, better config handling, new tests (match_rdns,
  mismatch, results), reject option.
* results_store: store processing results in data structures (vs notes)
* spf: refactored, added outbound checks when relaying, added 15 tests,
* dnsbl: return errors as Error objects, reduce list to unique zones, added
  tests, added search=multi option, handle ENOTFOUND error, added reject=false option.
* dns_list_base: bug fixes (race condition, returning invalid results)
* bounce: refactored, each check has enable and reject switches, added tests,
  added bad_bounce_to
* clamav: add virus name to results, better config parsing, typo fixes
* uribl:
* mf_resolvable:
* tls: add link to wiki article on TLS setup
* relay_acl: fix issue #428, refactored, don't crash when relay_dest_domains.ini
  missing, added tests
* fix mx mechanism when no records are returned
* vpopmaild: added per-domain feature
* karma: added whitelist award, pass through temp (DENYSOFT) errors, made
  tarpit variable, configurable reject hooks, doc rewrite, ASN awards, fix penalty days calculation, new DSL for karma awards,
* bannering fixes
* added log\* stubs to test/fixtures/[plugin|connection]
* tests/fixtures/stub_plugin: set name property
* config: corrected handling of config.arg gets, fix caching bug, fix boolean
  handling, added missing 'type' handling.
* Adding the option of using CIDR ranges in the haproxy_hosts file
* tarpit: added config option hooks_to_delay, added docs
* contrib/haraka.bsd.rc: startup file for \*BSD
* Store attachment headers on stream
* Record accepted domains at hook_rcpt and improve queue/lmtp
* return after next() in the whitelist checks
* Add new -o option to bin/haraka

## 2.4.0 - Feb 12, 2014

* Trim whitespace when reading "list" type config files (such as config/plugins)
* Added LMTP via queue/lmtp plugin
* Fixed bug in outbound when temp failing some of the recipients that would prevent delivery working to those recipients for future delivery attempts
* Add additional details/parameters to delivered hook for outbound mail
* Removed the hmail.bounce_extra object as that information now stored with the rcpt_to list
* Store the RCPT TO rejection reason on the address object


## 2.3.0 - Feb 07, 2014

* Fix memory leak when watching config files for changes
* Support for badly formatted MAIL FROM/RCPT TO lines
* Fix a memory corruption when fixing line endings
* Fix breakpoints in plugins when using node inspector
* Reload config in relay_force_routing without restart
* Don't re-attempt TLS upgrade if upgraded already and STARTTLS is re-advertised
* Improved outbound logging
* Pass failed recipients to bounce hook in outbound processing
* Added startup checks to ensure Haraka has been installed correctly
* Handle case of Haraka server running out of disk space better
* In mail_from.is_resolvable: move re_bogus_ip into config
* Added auth/auth_vpopmaild plugin - SMTP AUTH against a vpopmaild server
* Fixed graph plugin to work with sqlite3
* Added rcpt_to.qmail_deliverable plugin - Authenticate inbound RCPT TOs against Qmail::Deliverable daemon
* Added data.headers plugin which merges header checks into one place.
  Deprecates data.noreceived, data.rfc5322_header_checks, and data.nomsgid.
* Added documentation for logging system
* Added DKIM per-domain signing support
* Added p0f plugin
* In relay_acl, if host is allowed by acl, don't deny the recipient because the domain isn't in the allow list
* Add Authentication-Results header (RFC 5451) to all emails
* Fixed writing the todo file in outbound for newer Node versions
* Added Karma plugin to support penalizing consistently evil senders
* Added GeoIP plugin including distance calculation from your mail server
* Added bounce plugin for handling incoming bounce messages in various ways
* Fix underscores in documentation so web version doesn't look so weird
* By default prevent SMTP AUTH unless on a private IP or using TLS WARNING: May break some uses of Haraka, but is worth it for security
* In lookup_rdns.strict, check whitelist before looking up IP
* Big rewrite of the SpamAssassin plugin for simplicity and mainly to pass through X-Spam-* headers provided
* Added delay_deny plugin allowing more flexibility on when to reject mail
* Improvements to ini file parsing allowing floats and negative integers, and specifying boolean keys
* Fix issue causing a CRIT/crash with lost transaction/connection while sending inbound to ongoing SMTP server
* Allow setting of spamd_user for spamassassin plugin


## 2.0.0 - Nov 28, 2012

* Various fixes to SMTP AUTH code, including providing SMTP AUTH to inbound
  mail forwarders.
* Updates to process_title plugin to show more details
* Changed transaction.data_lines to a Stream (this will break all code which
  uses transaction.data_lines currently - see the migration guide)
* Changed attachments to be a Stream (this will break some code which uses
  transaction.attachment_hooks - see the migration guide)
* Capture and log signals sent to Haraka
* Various performance improvements
* Fixed a memory leak in connection pool
* Improvements to TLS compatibility
* RFC compliance improvements with greeting, EHLO/HELO, QUIT, and dot stuffing
* Throw exception with set_banner as it is now non-functional. Will be returned in a future version.
* Small fixes to data.uribl

## 1.4.0 -
