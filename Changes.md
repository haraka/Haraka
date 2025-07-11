# Changelog

The format is based on [Keep a Changelog](https://keepachangelog.com/).

### Unreleased

- change: finish renaming dot_stuffing to dot_stuffed
- deps: bump message-stream to 1.3.0, add some missing ^ chars
- feat(rabbitmq_amqplib): configurable optional exchange arguments #3472
- feat(rabbitmq_amqplib): configurable message priority #3472

### [3.1.1] - 2025-05-19

- Fix: install connection.ini with base configuration on install #3458
- fix(outbound): in outbound, fix a crash when socket connection errors #3456

### [3.1.0] - 2025-01-30

#### Changes

##### BREAKING CHANGE

`connection.ini` replaces the following config files:

| old file | connection.ini setting |
| ------ | ------ |
| haproxy_hosts | [haproxy] hosts |
| smtpgreeting | [message] greeting |
| ehlo_hello_message | [message] helo |
| connection_close_message | [message] close |
| banner_includes_uuid | [uuid] banner_chars |
| deny_includes_uuid | [uuid] deny_chars |
| databytes | [max] bytes |
| max_mime_parts | [max] mime_parts |
| max_line_length | [max] line_length |
| max_data_line_length | [max] data_line_length |

AND 

- moves the following settings from smtp.ini to connection.ini:
  - headers.*
  - main.smtp_utf8
  - main.strict_rfc1869
- early_talker.pause, removed support, use earlytalker.ini

To upgrade, apply any localized settings from the old config files to
the new `connection.ini` file. For tidiness, delete the deprecated
config files.

- feat(queue/test): Append UUID to E-Mails (avoid overwrite) #3449
- repackage p/early_talker as plugin #3443
- repackage p/mail_from.is_resolvable as plugin #3439
- repackage p/relay as haraka-plugin-relay #3432
- ci(cov): update codecov to v5
- deps(eslint): update to v9 #3433
- doc(plugins/\*.md): use \# to indicate heading levels
- deps(various): bump to latest versions
- doc(CoreConfig): removed incorrect early_talker.delay reference (hasn't worked in years).
- doc(LICENSE) fix copyright year #3424
- doc(access, backscatterer, & data.headers): deprecated plugin docs

#### Fixes

- fix(conn): always add connection.notes.tls properties #3450
- fix(conn): cumulative greeting message for custom greetings #3446
- fix(mail_from.is_resolvable): use correct config var path #3416
- fix(bin/haraka): fix for finding path to config/docs/Plugins.md #3414
- fix(outbound): in outbound, when mx.exchange contains an IP, use mx.from_dns #3413

### [3.0.5] - 2024-09-27

#### Fixed

- fix(q/lmtp): revert a refactoring error #3407
- fix: install Plugins.md when haraka -i #3406
- fix(haraka -h): add missing return for plugin list #3405
- fix `no_tls_hosts` related docs & tests #3404
- fix: install docs/Plugins.md when haraka -i installed
- fix(changes): spelling correction #3397

#### Changed

- lint: remove deprecated semi-style rule
- removed dependency on ldap plugins #3399
- doc(tls.md): add note for no_tls_hosts for outbound
- test(tls): add tests for no_tls_hosts for inbound & outbound
- dep version bumps:
  - haraka-email-message: 1.2.4, #3408
  - nodemailer: 6.9.15
  - nopt: 8.0.0
  - tld: 1.2.2
  - plugin-dkim: 1.0.7
  - plugin-dns-list: 1.2.1
  - plugin-elastisearch: 8.0.3
  - test-fixtures: 1.3.8


### [3.0.4] - 2024-08-21

#### Added

- doc: add CONTRIBUTORS #3312
- tls_socket: `config/tls` dir loading is now recursive

#### Changed

- prefix node libs with 'node:' #3359
- .gitignore: add config/me and config/*.pem
- auth_base: enable disabling constrain_sender at runtime #3298
- auth_base: skip constrain_sender when auth user has no domain #3319
- avg: repackaged as NPM module #3347
- bounce: repackaged plugin as NPM module #3341
- clamd: repackaged plugin as NPM module
- config/plugins: consistent formatting #3359
- connection: check remote is connected before queue #3338
  - improve log message for queue* hooks, fixes #2998
  - support IPv6 when setting remote.is_private #3295
  - in setTLS, replace forEach with for...of
  - NOTE: remove a handful of 3.0 sunset property names #3315
- contrib/plugin2npm.sh: fix path to package.json #3359
- deps: bump all versions to latest #3303, #3344, #3391
- dkim: repackaged as NPM module #3311
- esets: repackaged as NPM module #3353
- greylist: repackaged as NPM module
- helo.checks: require a successful HELO/EHLO #3352
- new NPM plugin dns-list, repackages dnsbl, dnswl, backscatterer #3313
- when using message-stream, don't send default options #3290
- rcpt_to.host_list: add connection ID to log messages #3322
- line_socket: remove unused callback #3344
- logger: don't load outbound (race condition). Instead, set name property #3322
- logger: extend add_log_methods to Classes (connection, plugins, hmail) #3322
- logger: when logging via `logger` methods, use short names #3322
- logger: check Object.hasOwn to avoid circular deps
- mail_from.resolvable: refactored, leaning on improved net_utils #3322
  - fixes haraka/haraka-net-utils#88
- messagesniffer: repackaged as NPM module
- outbound
  - check for local_mx only when default route is used #3307
  - client_pool: use tls_socket directly (shed line_socket)
  - client_pool: sock.name is now JSON of socket args
  - client_pool.get_client & release_client: arity of 5 -> 2
  - mx_lookup: make it async/await
  - mx_lookup: deleted. Logic moved into net_utils #3322
  - use net_utils.HarakaMx for get_mx parsing #3344
  - emit log message when ignoring local MX #3285
  - pass in config when initiating txn #3315
  - minor es6 updates #3315, #3322
  - logging improvements #3322
    - was: [-] [core] [outbound] Failed to get socket: Outbound connection error: Error: connect ECONNREFUSED 172.16.16.14:25
    - now: [A63B62DF-F3B8-4096-8996-8CE83494A188.1.1] [outbound] Failed to get socket: connect ECONNREFUSED 172.16.16.14:25
  - shorter logger syntax: logger.loginfo -> logger.info
  - remove log prefixes of `[outbound] `, no longer needed
  - delete try_deliver_host. Use net_utils to resolve MX hosts to IPs #3322
  - remove config setting ipv6_enabled #3322
  - remove undocumented use of send_email with arity of 2. #3322
  - encapsulate force_tls logic into get_force_tls #3322
  - es6(async/promise): pre_send_trans_email_respond, process_delivery
- queue/lmtp: refactored for DRY and improved readability #3322
- smtp_client: pass connect_timeout, maybe fixes #3281
- spamassassin: repackaged as NPM module #3348
- style(es6): more for...of loops
- deps: moved attachment, spf, & dkim into optional deps
- doc(Plugins.md): update registry
- doc(Outbound.md): improve GHFM formatting
- remove last vestiges of header_hide_version (long ago renamed)
- server.js: use the local logger methods
  - es6(async): _graceful, get_smtp_server, setup_smtp_listeners
  - replace async.eachLimit with Promise.all batches
- status: replace async.map with Promise.allSettled
- get Haraka version from utils.getVersion (which includes git id if running from repo)
- tls_socket: remove secureConnection. Fixes #2743
  - getSocketOpts is now async
  - parse_x509 is now async
  - shed dependency on caolin/async & openssl-wrapper
  - get_certs_dir is now async
    - completely refactored.
- transaction: init with conn.init_transaction, always pass in cfg #3315
- test: add a connection.response test case with DSN #3305
- test: convert test runner to mocha
- test: rename tests -> test (where test runner expect) #3340

#### Fixed

- fix(logger): refactor add_log_methods, don't set extra `loglog*` names
- doc(connection): update rfc7001 URL
- fix(bin/haraka): list NPM installed plugin #3310
- fix(bin/haraka): get hook list from doc/Plugins #3306
- fix(outbound): call cb even if no MX is found #3294
- fix(helo.checks): declare reject.literal_mismatch as boolean #3293
- fix(outbound): allow LHLO over insecure socket if TLS is forced #3278
- fix(outbound): include return path param SMTPUTF8 when required #3289
- fix(outbound): replace empty Message-ID header #3288
- fix(outbound): don't send SNI servername when connecting to an IP
- fix(outbound): chown queue dir after creation #3291
- fix(server): async endpoint.bind() and await in server.js #3366
- fix(outbound): get_mx DNS error handling #3376

### [3.0.3] - 2024-02-07

#### Added

- feat(auth_vpopmaild): when outbound, assure the envelope domain matches AUTH domain #3265
- doc(Plugins.md): add pi-queue-kafka #3247
- feat(rabbitmq_amqplib): configurable optional queue arguments #3239
- feat(clamd): add x-haraka-virus header #3207

#### Fixed

- Fix: add empty string as param to .join() on bounce. #3237
- Update links in documentation #3234
- fix(ob/hmail):Add filename to the error for easy debugging
- fix(ob/queue): Ignore 'error.' prefixed files in the queue because corrupted

#### Changed

- docs(outbound): remove example of outbound_ip #3253
- transaction: simplify else condition in add_data #3252
- q/smtp_forward: always register get_mx hook #3204
- dep(pi-es): bump version to 8.0.2 #3206
- dep(redis): bump version to 4.6.7 #3193
- dep(pi-spf): bump version to 1.2.4
- dep(net-utils): bump version to 1.5.3
- dep(pi-redis): bump version to 2.0.6
- dep(tld): bump version to 1.2.0
- remove defunct config files: lookup_rdns.strict.ini, lookup_rdns.strict.timeout, lookup_rdns.strict.whitelist, lookup_rdns.strict.whitelist_regex, rcpt_to.blocklist, rdns.allow_regexps, rdns.deny_regexps

### [3.0.2] - 2023-06-12

#### Fixed

- feat(q_forward): add LMTP routing handling #3199
- chore(q_forward): tighten up queue.wants handling #3199
- doc(q_forward): improve markdown formatting #3199
- helo.checks: several fixes, #3191
- q/smtp_forward: correct path to next_hop #3186
- don't leak addr parsing errors into SMTP conversation #3185
- connection: handle dns.reverse invalid throws on node v20 #3184
- rename redis command setex to setEx #3181

#### Changed

- test(helo.checks): add regression tests for #3191 #3195
- connection: handle dns.reverse invalid throws on node v20
- build(deps): bump ipaddr.js from 2.0.1 to 2.1.0 #3194
- chore: bump a few dependency versions #3184
- dns_list_base: avoid test failure when public DNS used #3184
- doc(outbound.ini) update link #3159
- doc(clamd.md) fixed spelling error #3155

### [3.0.1] - 2023-01-19

#### Fixed

- fix(bin/haraka): set server.cfg and pass to conn, fixes #3143
- fix(bin/haraka): correct error messages for help options #3142
- fix: dkim_verify fails to find record #3149

#### Changed

- plugins: Add haraka-plugin-outbound-logger to registry #3146
- dep(pi-spf): bump version 1.1.3 to 1.2.0

### [3.0.0] - 2022-12-17

#### Added

- feat: prevent local delivery loop when target exchange resolves to a local hostname #3002
- feat: format DKIM signature to multiline #2991

#### Fixed

- fix(tls): redis promise syntax for tls & ob/tls #3064
- fix(attachment): error handling with complex archive #3035
- fix(smtp_client): run "secured" once, fixes #3020
- fix(smtp_client): add missing `$` char in front of interpolated string
- fix(auth_proxy): run "secured" only once, improvement for #3022
- fix(helo): remove multi-check from should_skip #3041
- fix(outbound): outbound local mx check #3010
- fix(outbound): prevent delivery loop when target MX resolves to local hostname #3002
- fix(conn): socket can't be released when disconnect after DATA command #2994

#### Changed

- dep(generic-pool): remove pooling from outbound #3115
- smtp_client: disable pooling in get_client_plugin, #3113
- smtp_forward: restore ability to enable queue_outbound #3119
- ./mailbody & ./mailheader moved to haraka-email-message #3071
- config/plugins: update name of uribl plugin
- doc(queue.js) spelling & grammar improvement #3051
- doc(rails): add haraka-plugin-queue-rails #2995
- doc(smtp.ini): correct spelling of SMTPUTF8 #2993
- style(es6): use optional chaining when accessing transactions #2732
- style(smtp_client): pass args as objects (was positional)
- style(plugin/\*): transaction guarding #3032
- dep(spf): remove to separate plugin #3078
- dep(iconv): removed, declared in haraka-email-message)
- dep(haraka-plugin-redis)!: 1.0 -> 2.0 #3038
- dep(redis)!: 3.1 -> 4.1 #3058
- dep(generic-pool): remove pooling from outbound #3115
- smtp_client: remove smtp_\* pooling support in #3113
- dep: bump plugin versions #3063
- dep: bump haraka-plugin-asn from 1.0.9 to 2.0.0 #3062
- dep(redis): 3.1 -> 4.1 #3058
- dep(nopt): 5 -> 6.0.0 #3076
- dep(haraka-plugin-fcrdns): 1.0.3 -> 1.1.0 #3076
- dep(haraka-plugin-redis): 1.0 -> 2.0 #3038
- dep(nodemailer): 6.7.0 to 6.7.2 #3000, #3004
- dep: add explicit dependency on node-gyp 9
- ci: github action tweaks #3047
- chore: transaction guarding #3032
- ci: enable windows node 16 testing #3036
- chore: update phusion image #2988
- chore: add lots of `if (!transaction) return` in places #2732
- chore(test): build shims for windows-2022 & node on windows #3052
- chore(test): restore CI tests to working order #3030
- dkim_sign: reformat dkim signature to multi-line #2991
- dkim_sign: remove spurious error logging #3034
- tls: add force_tls option to the ToDo object
- fix(banner): banner was inserted erroneously into text attachments
- outbound: remove hardcoded AUTH PLAIN authorization identity
- outbound: set acquireTimeoutMillis to prevent constant reconnect to unreachable servers
- style(smtp_client): pass args as objects (was positional)
- uribl: timeout DNS 1 second before plugin, #3077
- uribl: load .ini config to plugin.cfg, add basic tests #3077

### 2.8.28 - 2021-10-14

#### Changes

- breaking: dkim.js has changed the constructor opts
- tls_socket: more flexible pem file parsing #2986
  - move bad certs into different directory, avoid test suite noise
- added ability to define a default relay in relay_dest_domains
- spamassassin: replace msg_too_big & should_check with should_skip #2972
- spamassassin: allow returning DENYSOFT on errors #2967
- dep: use caret version range for all dependencies #2965
- outbound: disable outbound to localhost by default #2952
- connection error logging: use key-value pairs #2921
- tls: change default to NOT send TLS client certs #2902
- dep: redis is now a dependency #2896
- use address-rfc2821 2.0.0
- http: use CDN for bootstrap/jquery, drop bower #2891
- drop support for node 10 #2890

#### New features

- tls: require secure and verified sockets for configured hosts/domains
- DKIM plugin has got a couple of config options now
- tls: add `no_starttls_ports` - an array of incoming ports where STARTTLS is not advertised
- outbound: add local_mx_ok config #2952
- skip plugins at runtime by pushing name into transaction.skip_plugins #2966
- outbound: add ability to specify delay times for temporary fails in `temp_fail_intervals` #2969

#### Fixes

- bounce: correctly set fail recipients #2901
- bounce: correctly set bounce recipients #2899
- Get local_ip from getsockname() instead of server properties #2914
- Received header TLS section adheres more closely to RFC 8314 #2903
- use RFC-2045 Quoted-Printable in email message body
- use RFC-2047 Q encoded-words in email headers

### 2.8.27 - 2021-01-05

#### Changes

- bump verions of several dependencies #2888
- propagate hmail notes to split copies #2887
- log.ini: add json to list of formats in config doc #2881
- exclude port 587 from TLS NO-GO feature #2875
- strip _haraka-plugin-_ prefixes off plugin names in config/plugins #2873
- pass smtp.ini config from Server into connections & transactions #2872

#### New features

- add ability to disable SMTPUTF8 advertisement #2866

#### Fixes

- assure headers.max_lines is initialized as integer #2878
- require haraka-net-utils >= 1.2.2 #2876

### 2.8.26 - 2020-11-18

#### Changes

- add config options for OAR & AR headers #2855
- plugins.js: also strip haraka-plugin prefix from plugin.name #2846
- smtp_forward/spamssassin: grab refs of conn/txn to avoid crashes due to lack of existence. #2847
- outbound: add extended reason to bounce message #2843
- hgrep: replaced perl script with shell script #2842
- connection: send temp error when requested #2841
- headers: updated deprecated messages #2845
- hmail: socket.on -> socket.once #2838
- hmail: check for zero length queue file #2835
- outbound: add os.hostname() as default for outbound HELO #2813
- use node v10's mkdir instead of mkdirp #2797
- CI: drop appveyor and Travis #2784
- lint: add 'prefer-template'
- update async to version 3.2.0 #2764
- update redis to version 3.0.0 #2759
- remove deprecated max_unrecognized_commands from config #2755
- CI: add ES2017 support, drop node 8 #2740
- fix broken bannering on nested mime parts #2736
- restore TLS version info, set correctly #2723
- better error message when invalid HELO hostname is rejected
- bring STARTTLS "TLS NO-GO" feature in line with Outbound's #2792
- add listener for secureConnect #2828
- removed plugins/data.headers to haraka-plugin-headers #2826
- add zero-length queue size check
- send temp instead of hard error when asked to by `unrecognized_command`

#### New features

- Allow web interface to be bound to unix socket #2768
- tls: add configurable minVersion to tls socket options #2738
- connection_close_message: added ability to override close connection message replacing `closing connection. Have a jolly good day.` #2730
- add JSON format for logging #2739
- support binding web interface to unix socket

#### Fixes

- check for punycode domain names when resolving MX, avoid crash #2861
- wait until entire message is spooled when spool_after in use #2840
- hmail: add missing space in temp_fail emitter #2837
- fix outbound config reloading after outbound split #2802
- smtp_forward: remove redundant outbound hook #2796
- smtp_forward: this plugin does not use the queue_outbound hook anymore #2795
- Fix connection pool not being unique when hosts and ports were equal between domains #2789
- fix connection pool not being unique when hosts and ports were equal between domains #2788
- Fix outbound.bounce_message To: header (and add Auto-Submitted) #2782
- Fix support for DKIM signing when forwarding and aliasing is enabled #2776
- Better error message when EHLO hostname does not have a dot #2775
- fix bannering on nested mime parts #2737
- TLS: don't abort loading certs in config/tls dir when an error is encountered. Process every cert file and then emit errors. #2729
- restore TLS version, correctly #2723

### 2.8.25 - 2019-10-11

#### Changes

- conn: remove TLS version from header #2648
- Actually enforce using key for INTERNALCMD #2643
- trans: assign conditions to named vars #2638
- drop node.js v6 support #2632
- conn: use is_local instead of localhost addr tests #2627
- spamassassin: spamassassin: strip useless WS from tests #2624
- es6: many updates #2615, #2674, #2680
- systemctl: update service definition #2612
- lint: bracket style to match newer eslint:recommended #2680
- lint: use object shorthands (eslint:recommended) #2680
- logger: use safer Object.prototype.hasOwnProperty #2680
- outbound: permit # char in SMTP status code response #2689
- dkim_sign: improve docs, add tests, es6 updates #2649
- dkim_sign: restore default key signing feature #2649
- tmp module: update to latest #2614
- semver: update to latest #2616, #2651
- async: update to latest #2653, #2664
- repo cleanup: replaced deprecated plugins with list #2681
- spf: es6 patterns, results.pass, test improvements, es6 patterns #2700

#### New features

- spf: add config option to fail on NONE #2644

#### Fixes

- mailheader: fully quality header name in \_remove_more #2647
- haraka: Connection.createConnection is not a constructor #2618
- problems with japanese characters in body and part header #2675
- toobusy: fix hook name (connect_pre -> connect) #2672
- outbound: watch for socket timeouts #2687
- outbound: permit # char prefix in SMTP status code response #2691
- mailheader: strip whitespace between encoded-words #2702

### 2.8.24 - Mar 12, 2019

#### Changes

- early_talker: skip if sender has good karma #2551
- dockerfile: update to node 10 #2552
- Update deprecated usages of Buffer #2553
- early_talker: extend reasons to skip checking #2564
- tls: add 'ca' option (for CA root file) #2571
- outbound: little cleanups #2572
- smtp_client: pass pool_timeout to new SMTPClient #2574
- server: default to nodes=1 (was undefined) #2573
- test/server: use IPv4 127.0.0.1 instead of localhost #2584
- queue/smtp_*: add v3 upgrade notice and config setting #2585
- spf: use the skip config for helo/ehlo checks #2587
- spf: avoid 2nd EHLO evaluation if EHLO host is identical #2592
- queue.js refactoring #2593
- Log dkim_sign parse errors with connection ID #2596
- Update ipaddr.js to the latest version #2599
- make inactivity timeout match docs #2607

#### New Features

- Implement SIGTERM graceful shutdown if pid is 1 #2547
- tls: require validated certs on some ports with requireAuthorized #2554
- spamassassin: disable checks when requested #2564
- clamd: permit skipping for relay clients #2564
- outbound: exported outbound.temp_fail_queue, outbound.delivery_queue and add TimerQueue.discard()
- status: new plugin #2577

#### Fixes

- mf.resolvable: reduce timeout by one second (so < plugin.timeout) #2544
- LMTP blocks under stress #2556
- invalid DKIM when empty body #2410
- prevent running callback multiple times on TLS unix socket #2509
- add missing callback when listing queue and empty directory
- correct MIME parsing when charset: utf8 and encoding: 8bit #2582
- spamassassin: default check flags to true #2583
- smtp_client: destroy when connection gets conn timeout error #2604
- on error and timeout, remove listeners and destroy conn. #2606

### 2.8.23 - Nov 18, 2018

#### Changes

- tighten Haraka pattern in .gitignore #2542

### 2.8.22 - Nov 17, 2018

#### New Features

- enable tls/ssl for rabbitmq amqplib plugin #2518

#### Fixes

- hmail: don't send RSET to LMTP #2530

#### Changes

- clamd: add check.authenticated, check.private_ip, check.local_ip option
- use get_decoded on headers that may be encoded #2537
- connection: move max_mime_part config load to connection init #2528
- outbound: init TLS when we send email, not when old queue file is loaded #2503
- relay: update port 465 doc #2522
- hmail: log the correct err message #2531
- ob/tls: consistently use obtls (vs plugin) for "this" name #2524
- outbound: add domain to loginfo message #2523
- Add connection.remote.is_local #2532
- update license #2525
- perf: move max_mime_parts config load to connection init #2529
- update semver to version 5.6.0 #2517
- added hint to encrypted file authentication #2514
- dkim_sign: improved log messages #2499
- ehlo_hello_message: config/ehlo_hello_message can be used to overwrite the EHLO/HELO msg replacing `, Haraka is at your service` #2498
- connection: add connection.remote.is_local flag for detecting loopback and link local IPs
- add .name to outbound TLS for logs #2492

### 2.8.21 - Jul 20, 2018

#### New Features

- outbound: skip STARTTLS after remote host fails TLS upgrade #2429
- dns_list_base: introduce global plugin.lookback_is_rejected flag #2422

#### Fixes

- replace all \_ chars in hostnames with code points #2485
- Don't die on invalid commands #2481
- outbound: check list exists before attempting to use it #2478
  - refactor outbound/hmail.process_ehlo_data #2488
- tls: skip when redis is undefined #2472
- Don't run delivered hook on LMTP fail #2470
- Add tls_socket.load_tls_ini() to tls.register() #2465

#### Changes

- outbound/tls: make into a class #2474
- plugins: clear timeout on cancel #2477
- txn.parse_body consistently a boolean #2476
- update ipaddr.js to version 1.8.0 #2468

### 2.8.20 - Jun 29, 2018

#### Fixes

- data_headers: check defined-ness of hdr_address _after_ try/catch #2458
- tls: remove tls.ini loading from plugins/tls #2459
- tls: remove invalid opt from load_tls_ini #2456
- outbound: escape values in HTML bounce correctly #2446
- dkim_sign: catch exceptions when address-rfc2822 fails to parse From #2457

#### Changes

- logger: Add "obj" log param to log hook that contains log data by type #2425
- logger: include outbound client ID in logging #2425
- logger: allow specifying uuid in params when logging #2425

### 2.8.19 - Jun 26, 2018

#### New features

- outbound: received_header=disabled supresses outbound Received header addition. #2409
- auth_base.js: `check_plain_passwd` and `check_cram_md5_passwd` can now pass `message` and `code` to callback routine
- spf: allow bypass for relay and AUTH clients #2417
- spf: optionally add OpenSPF help text to rejection #2417
- auth_base: prevent storing of AUTH password in connection.notes.auth_passwd by setting plugin.blackout_password. #2421

#### Fixes

- Mitigate MIME part explosion attack #2447
- Always prefix ClamAV with a Received header #2407
- plugins/data.headers.js: wrap address-rfc2822 header parse into try block #2373
- tls_socket: as client, only apply TLS opts if config is valid #2414
- when installing, creates config/me if missing #2413
- queue/qmail-queue: fix a 2nd crash bug when client disconnects unexpectedly #2360
- remove desconstruction of SMTP commands to prevent exception #2398
- attstream: return self so that pipe() calls can be chained together. #2424
- outbound: fix dotfile cleanup to consider platform-based prefix. #2395
- outbound: fix handling of LMTP socket when a socket path is specified. #2376

#### Changes

- relay: move relay acl check to connect_init so flag is set earlier #2442
- process_title: add total recipients, avg rcpts/msg, recipients/sec cur/avg/max and messages/conn #2389
- when relaying is set in a transaction, don't persist beyond the transaction #2393
- connection.set supports dot delimited path syntax #2390
- remove deprecated (since 2.8.16) ./dsn.js
- Add transaction.msg_status property that reflects message status. #2427
- Add transaction.notes.proxy object that hold HAProxy details. #2427
- spamassassin: make relay header configurable. #2418
- deprecate max_unrecognized_commands plugin in favor of limit. #2402
- xclient: add support for DESTADDR/DESTPORT. #2396

### 2.8.18 - Mar 8, 2018

#### New features

- smtp_forward: domain configuration is now chosen based on domain_selector #2346

#### Fixes

- queue/qmail-queue: fix crash bug when client disconnects unexpectedly #2360
- tls: fix crash bug in `unrecognized_command` hook
- `dkim_key_gen.sh`: improve usability and parameter parsing #2355

#### Changes

- document `force_shutdown_timeout` and `graceful_shutdown` settings #2350

### 2.8.17 - Feb 16, 2017

#### New Features

- SMTPS port is configurable #2269
- smtp_forward: enable_outbound can be set per domain #2335

#### Fixes

- Fix ability to set log level to emerg #2128
- outbound/hmail: use Buffer to correctly read binary file data + tests #2231
- quarantine: consolidate 2x hook_init_master functions
- tls_socket: restore SNI functionality, emit count of TLS certs #2293
- fix smtp_client error handling #2298
- fix outbound pools #2317
- add openssl-wrapper as dependency #2320
- replace \_ chars in hostnames with code points #2324
- add this.removeAllListeners('connection-error') #2323
- Fix crashing on RSET #2328
- Prevent data headers crit fail #2329
- Fix undefined max_lines in log message #2337

#### Changes

- line_socket: remove superfluous function #2339
- consistent end of function declaration semicolon #2336
- connection: assure hostname is set #2338
- smtp_client: Fix log message typo #2334
- Update ipaddr.js to version 1.6.0 #2333
- Warn on max_header_lines #2331
- update jquery version #2322
- plugins: add SRS plugin to registry #2318
- tls_socket: only generate dhparam.pem on master process #2313
- add ENOTFOUND to also check A record #2310
- smtp_forward: correct config file name in docs #2309
- reduce severity of iconv conversion failure #2307
- Add txn UUID to "250 Message Queued" #2305
- mailheader: reduce log level priority #2299
- greylist: only log redis DB errors when exist #2295
- data.headers: reduce undef MLM logerror to logdebug #2294
- quarantine: consolidate 2x hook_init_master() #2292
- move test_queue to queue/test #2291
- in haraka plugin test mode, add server.notes #2248
- outbound/hmail: refactor #2238
- outbound/hmail: add JSON sanity test before JSON.parse #2231
- outbound/index: use newer Buffer.from syntax #2231
- outbound/hmail: make haraka queue files human friendly #2231
- plugins/rcpt_to.ldap -> haraka-plugin-rcpt-ldap #2144
- plugins/auth/auth_ldap -> haraka-plugin-auth-ldap #2144
- plugins/smtp_forward: enable_outbound can be enabled/disabled for specific domains
- auth_proxy: read TLS key and cert files from tls.ini #2212
- README: typo fixes #2210
- incorrect RCPT TO reply message #2227
- Resolve decoding bug when root part is base64 encoded. #2204
- Resolve base64 data truncation #2188
- Fix damaged encoding when body is non-utf #2187
- Fix disconnect hooks #2184
- ability to set log level to emerg #2128
- Improve docs for `Address` objects #2224
- connection: replace 3x ternaries with get_remote() #2169
- connection.local.host populated with hostname (from config/me) #2165
- connection.local.info populated with Haraka/version #2196
- npm packaged plugins:
  - plugins/rcpt_to.ldap -> haraka-plugin-rcpt-ldap #2144
  - plugins/auth/auth_ldap -> haraka-plugin-auth-ldap #2144
  - plugins/graph -> haraka-plugin-graph #2185
- config: replace ./config.js with haraka-config #2119
- Replace concatenated strings with template literals #2129 in:
  - attachment #2260
  - bin/spf #2129
  - bin/dkimverify #2278
  - connection #2129, #2243
  - delay_deny #2264
  - dkim #2216
  - dsn #2265
  - host_pool #2198, #2245
  - logger #2277, #2246
  - mailbody #2280
  - max_unrecognised_commands #2171
  - outbound/hmail #2259
  - outbound/index #2249
  - outbound/todo #2233
  - plugins #2239
  - plugins/aliases #2229
  - plugins/attachment #2155
  - plugins/auth_base #2252
  - plugins/avg #2156
  - plugins/backscatterer #2261
  - plugins/bounce #2229
  - plugins/clamd #2237
  - plugins/connect.rdns_access #2262
  - plugins/data.headers #2263
  - plugins/data.uribl #2258
  - plugins/helo.checks #2255
  - plugins/rcpt_to.in_host_list #2253
  - plugins/spamassassin #2256
  - plugins/profile #2170
  - plugins/rcpt_to.host_list_base #2254
  - plugins/relay #2174
  - plugins/relay_acl #2177
  - plugins/spf #2266
  - plugins/toobusy #2186
  - plugins/xclient #2159
  - rfc1869 #2160
  - smtp_client #2129, #2208
  - tests/host_pool #2159
- use es6 destructuring (#2075) in:
  - connection #2230
  - dkim #2232
- use es6 classes (#2133) in:
  - attachment #2260
  - attachment_stream #2215
  - chunkemitter #2219
  - dkim #2206
  - dsn #2247
  - host_pool #2194
  - mailheader #2213
  - mailbody #2213
  - smtp_client #2221
  - spf #2214
  - tls_socket #2190
  - timer_queue #2226
  - outbound/hmail #2197
  - outbound/todo #2233
- Automatically set connection.remote.is_private when connection.remote.ip is set #2192
- Add remove_msgid and remove_date options to outbound.send_email #2209
- Add origin option to outbound.send_mail #2314

### 2.8.16 - Sep 30, 2017

#### Changes

  - additional tests get var -> const/let medicine #2122
  - move connection states into haraka-constants #2121
  - lint: remove useless escapes #2117
  - lint: switch no-var to error #2109
  - rspamd: repackaged as NPM module #2106
  - dsn: repackaged as NPM module haraka-dsn #2105
  - outbound: add results when queueing #2103
  - spamassassin: skip adding headers when value is empty #2102
  - Replace console.log with stdout #2100
  - update js-yaml to version 3.10.0 #2097
  - repackage p0f plugin to NPM #2076
  - ES6: replace var with const or let #2073

#### New Features

- Bounces can have an HTML part #2091

#### Fixes

- daemon cwd #2126
- updated fcrdns plugin name passed to results #2115
- tls: only apply default key/cert paths when undefined #2111
- dkim_verify: fix formatting of auth results #2107
- smtp_forward: consistently use queue.wants #2107
- haraka was adding TLS header on non-TLS connection #2103
- dkim typo fix #2101
- fix rfc2231 parsing code to cope with continuation #2089

### 2.8.15 - Sep 10, 2017

#### Changes

- Permit log settings to be set w/o LOG prefix #2057
- additional results storing in smtp_forward and quarantine #2067
- publish p0f plugin to NPM #2076
- smtp_forward stores queue note at queue.wants #2083
- Remove unused folders from installation #2088
- smtp_forward stores queue note at queue.wants #2083
- add get/set to conn/txn.notes #2082
- additional results storing in smtp_forward and quarantine #2067
- Permit log settings to be set w/o LOG prefix #2057
- support INFO _and_ LOGINFO as config settings #2056
- log.ini, new default location for log related settings #2054
- dcc: replace with npm packaged version #2052
- qmd: replace rcpt_to.qmail_deliverable with npm #2051
- rspamd: pass SPF evaluation #2050
- add logfmt support #2047
- update ipaddr.js to version 1.5.0 #2037
- update redis to version 2.8.0 #2033
- disable graceful for SIGTERM #2028
- add additional integration tests #2026
- move most npm packaged plugins into optionalDependencies #2023

#### New Features

- TLS certificate directory (config/tls) #2032
- plugins can specify a queue plugin & next_hop route #2067
- connection/transaction notes now have get/set #2082

#### Fixes

- haraka cli will now create folders if they don't exist #2088
- maybe fix for #1852 503 response #2064
- crash when 'AUTH LOGIN' is sent after a successful auth #2039
- docs: fixed swaks test command #2034
- dkim: prevent dkim_verify from causing 'cannot pipe' #1693

### 2.8.14 - Jul 26, 2017

#### Changes

- Fix auth plugin failure when re-selecting auth method #2000
- don't crash Haraka when invalid YAML config encountered #2013
- update semver to version 5.4.0 #2015
- relay docs: correct the config file name #2012
- rename config/xclient.hosts to match plugin & docs #2014
- build_todo() is part of the outbound/index.js api #2016
- update js-yaml to version 3.9.0 #2002
- outbound/hmail: use WRITE_EXCL from haraka-constants #2011
- replace plugins/log.elasticsearch with npm packaged #2004
- Remove two spurious log statements #1989
- access: rebuild blacklist upon change (vs supplement) #1990
- deliver to qmail-queue with LF line endings (not CRLF) #1997
- doc: add note that smtp_forward only supports STARTTLS #1988
- import Plugins.md from v3 #1991
- update async to 2.5.0 #1982
- update iconv to 2.3.0 #1981
- require node.js v6+ #1958
- update ipaddr.js to 1.4.0 #1972
- support newer address-rfc2822 #1970
- update node-address-rfc2821 version to 1.1.1 #1968
- outbound: be consistent with todo.domain #1960
- bump haraka-results required version #1949
- logger: load in a setImmediate call #1948
- logger: strip intermediate \n chars #1947
- tls consistency cleanups #1851
- Get pool config handling simplifcation #1868
  - add integration test: send message w/smtp_client
- replace some legacy code with es6 #1862
- update async to version 2.2.0 #1863
- update ipaddr.js to version 1.3.0 #1857
- update redis to version 2.7.0 #1854
- assure conn/tran still exists before storing results #1849
- moved tls.ini parsing to net_utils #1848
- smtp forward dest split routing #1847
- rspamd: refactor complex condition into function #1840
- block js attachments #1837
- helo.checks: bring plugin into alignment with docs #1833
- when proxy enabled, update remote.is_private too #1811
- create an outbound queue filename handler #1792
- replace fcrdns with npm package #1810
- add an additional node_modules plugin search path #1805
- Set graceful shutdown off by default #1927
- Allow outbound pools to be disabled #1917
- Outbound split and move into folder #1850
- don't emit binary characters into the logs #1902
- Add .editorconfig #1884
- tls: remove interim variables #1871

#### New Features

- Use punycode domain (support SMTPUTF8) #1944
- Added RabbitMQ vhost support #1866
- clamav: allow "Unknown Result" and Socket Error to try next host #1931
- outbound client certificates #1908
- Implement the missing upgrade method on SMTPClient #1901
- Remove typo from relay.md #1886

#### Fixes

- outbound: fix queue not loaded for single process #1941
- outbound: Fix undefined variable platformDOT in hmail.js #1943
- outbound: fix undefined FsyncWriteStream var #1953
- Fix cluster messaging for node v6+ #1938
- outbound: fix loading under cluster. #1934
- Check pool exists before delete #1937
- be more strict in attachment filename matching #1957
- doc typo fix #1963
- RabbitMQ: fix encoding of user and password string #1964
- spf: improve modifier regexp #1859
- rabbitmq doc typo in config file name #1865
- URL to manual was 404, point to Plugins.md #1844
- smtp_client: set idleTimeout to 1s < pool_timeout #1842
- fix broken continuations #1843
- doc error for the 'check.authenticated' setting in rspamd plugin #1834
- emit _the_ result, not all of them #1829
- fix outbound logger #1827
- fix forwarding with client auth over TLS (forward to gmail) #1803
- Don't blow the stack on qstat #1930
- run dumped logs through log plugins, not console #1929
- Fix path parsing bug on Windows platform #1919
- helo: make sure list_re is defined before access #1903
- TLS: handle case where OCSP server is unavailable #1880
- rspamd: add missing 'default' keyword #1856
- disable naïve comment stripping #1876

### 2.8.13 - Feb 03, 2017

#### Changes

- new [haraka-plugin-limit](https://github.com/haraka/haraka-plugin-limit) #1785
  - replaces plugin/limit, plugin/rate_limit, and haraka-plugin-outbound-rate-limit
- p0f: skip on private IPs (normally empty) #1758
- spf: skip for outbound when context != myself #1763
- redis: plugins using redis can inherit redis config #1777
- redis: replace plugins/redis with haraka-plugin-redis #1786
- lint: require space before function declaration #1784
- lint: added eslint:recommended #1790
- logger: remove logger.colorize code for legacy node versions

#### New Features

- redis: add `redis_subscribe_pattern()` #1766
- queue/discard: add ENV that permits discarding #1791

#### Improvements

- rspamd: improve response parsing #1770
- restore Windows testing to working state #1755
- elasticsearch: use UTC dates for index creation #1771
- tls: fix dhparam usage example syntax #1774
- typo: logerr -> logerror #1776
- when generating long DKIM keys, include a BIND compatible folded key #1775
- in haraka-test-fixtures, access results via fixtures.results #1783
- integration test: end to end server testing #1791

#### Fixes

- spf: restore functionality for relay context=myself #1759
- rate_limit:if incr creates a new record, assure it has a TTL #1781
- tls: do not create a top level secureContext #1787
- dnswl: swap lines to fix missing inherited methods #1793
- dnswl: fix config loader callback syntax #1794
- tests/plugins: unset process.env.HARAKA to avoid side effects that interfere with other tests
- remove auth_flat_file sample auth user #1796

### 2.8.12 - Jan 03, 2017

#### Changes

- plugin/karma -> npm packaged haraka-plugin-karma #1747
- update generic-pool 2.4.2 -> 2.5.0

#### New Features

- Added option to bypass SpamAssassin headers' merge #1745

#### Improvements

- reduce severity of debug message #1744
- fix misleading entries in config/tls.ini #1734
- Misc. performance improvements #1738
- set tls.sessionIdContext property (for Thunderbird compat) #1740

#### Fixes

- Swap lines to avoid clobbering response array #1743

### 2.8.11 - Nov 24, 2016

#### Changes

- rename core_require to haraka_require #1708
- move log.syslog to haraka-plugin-syslog #1698
- remove tls.ini loading and is_no_tls_host to net_utils #1690
- replace ./utils with npm packaged haraka-utils #1720
- require node 4
- karma: add .top TLD scoring #1714

#### New Features

- Implement OCSP Stapling #1724

#### Improvements

- show help for npm packaged plugins included in core #1698
- use tls.connect for client #1682
- bring port 465 SMTPS TLS config support on par with STARTTLS #1667
- use tls.connect instead of createSecurePair #1678
- redis: improve error handling in tests #
- replace / path seperators with path.* for cross platform compat #1713

#### Fixes

- dkim_sign: per-domain key finding fixed #1707
- Rspamd: restore spam report header #1702
- auth/vpopmail: do not toString() when null #1695
- fix outbound to avoid recursive reading key/cert after refactoring #1692
- tls: fix option servername (not hostname) #1728
- correct Auth-Results cleaning #1726
- fix results for connection.remote_host and NXDOMAIN #1716

### 2.8.10 - Oct 20, 2016

#### Changes

- use standard npm syntax for lint and tests #1646
- remove ./net_utils to haraka-net-utils #1644
- remove incorrect and unused spf.hello_host #1635
- remove rogue DENYSOFT copy-pasta error #1634
- update async to v2 #1545
- remove plugin/dir support from base haraka #1668
  - use node_modules_dir support instead
- use TLSSocket instead of createSecurePair #1672
- refactor plugins/tls #1670
- moved watch plugin to npm as haraka-plugin-watch #1657
- normalize proxy properties #1650

#### New Features

- added connection.remote.is_private boolean #1648
- added additional TLS options (@typingArtist) #1651
- added wildcard boolean support to config loader #1680
- tls: allow multiple key and cert parameters for RSA+ECDSA #1663
- permit specifying haraka plugins w/o haraka-plugin- prefix #1645
  - in config/plugins and resultstore

#### Improvements

- connection.geoip replaced by haraka-plugin-geoip #1645
- connection.asn replaced by haraka-plugin-asn #1645
- permit specifying npm packaged plugins w/o haraka-plugin prefix #1647
- normalized connection properties #1547, #1577
- Rspamd: fix spambar for negative scores #1630
- set connection.remote.is_private early
  - replace calls to net_utils with remote.is_private test

#### Fixes

- Tidy-up graceful shutdown and fix for non-cluster mode #1639
- Fix data.headers plugin crash #1641
- Fix access plugin crash #1640
- Minor DKIM fix #1642
- do not set TLS timer if timeout=0 #1632
- do not overwrite config/host_list on install #1637
- correct smtp_forward cfg for multiple rcpts #1680
- fix TLS timeout errors #1665

### 2.8.9 - Oct 02, 2016

#### New Features

- Support outbound.pool_timeout of 0 to effectively disable pooling. #1561
- Added never_add_headers option to rspamd plugin. #1562
- rcpt_to.routes URI format w/ LMTP support #1568

#### Improvements

- The delay_deny plugin now has a whitelist mode (vs blacklist). #1564
- Don't show the private key in logs for dkim_sign. #1565
- update geoip for compat with newer ES #1622
- drop node 0.10 testing / official support #1621
- watch plugin displays UUIDs as URL #1624
- Catch errors on header decode in rfc2231 #1599
- Attachment plugin updates #1606
- add outbound.ini pool_timeout example setting #1584

#### Fixes

- Fixed some small documentation issues. #1573, #1616, #1612
- Fixed AUTH PLAIN when it spreads over two lines. #1550
- Fixed dkim_verify calling next() too soon. #1566
- Fixed bugs with outbound pools who shutdown before we QUIT. #1561, #1572
- outbound issues #1615, #1603
- Fixed adding/removing headers in rspamd plugin. #1562
- Fixed process_title not shutting down. #1560
- fix a spurious error emitted by p0f #1623
- fix header version hiding #1617
- messagestream returns destination #1610
- plugins.getdenyfn now passed 3rd params arg #1591
- Fix scope of spf logdebug #1598
- fix rabbitmq deliveryMode bug #1594
- fix dkim_sign TypeError with null mail_from.host #1592
- fix dkim_sign attempting to lower an undefined #1587

### 2.8.8 - Jul 20, 2016

#### Changes

- removed UPGRADE.doc to [wiki](https://github.com/haraka/Haraka/wiki/Upgrade-Haraka)

#### Improvements

- support + wildcard in aliases plugin #1531
- Support dkim_sign with outbound.send_email() #1512
- spf: always check remote IP, then public IP if != pass #1528
- spf: diplay IP used for SPF eval #1528

#### Fixes

- handle missing wss section in http.ini #1542
- fix leak on socket write error #1541
- add results property to outbound transaction #1535
- don't unref unref'd wss server #1521

### 2.8.7 - Jun 18, 2016

#### Changes

- Fix geoip test

#### Improvements

- Allow alias plugin to explode to a list of aliases
- Support IPv6 literals in HELO tests #1507
- Make ldap plugin use the modified address if a rcpt hook changes it #1501

#### Fixes

- Fix loading plugins as npm modules #1513
- More DKIM fixes #1506
- Fix the long failing host-pool-timer test #1508
- Fix clean shutdown of redis with new shutdown code, #1504 and #1502
- More fixes to clean shutdown #1503

### 2.8.6 - Jun 06, 2016

#### Fixes

- Fix loading under Node v4 which sends a blank message
- Fix quit (SIGINT) when running without nodes=

### 2.8.5 - Jun 04, 2016

#### Changes

- The connection object is now passed to `get_plain_passwd`. Older modules should continue to work as-is.
- The reseed_rng plugin now just uses the Crypto module from core. Though it seems this plugin should be irrelevant with newer versions of node.js

#### New Features

- Outbound mail now uses pooled connections, only sending a `QUIT` message if the connection has been idle for a while.

#### Improvements

- Shut down and reload (via `haraka -c <path> --graceful`) is now graceful - allowing current connections to finish and plugins to clean up before ending.

#### Fixes

- Bind maxmind version to ignore API change #1492
- Fix encodings when banners are used #1477
- Various DKIM fixes #1495

### 2.8.4 - May 24, 2016

#### Fixes

- Fix plugin loading override when installed (#1471)

### 2.8.3 - May 18, 2016

#### Fixes

- Fix config overriding for core modules (#1468)

### 2.8.2 - May 17, 2016

#### Changes

- Added Node v6 to travis tests

#### New Features

- Added bin/haraka --qunstick <domain> to flush all mails
    for that domain (#1460)

#### Improvements

- Make bin/haraka --qlist show much more information (#1452)
- Allow CIDR ranges in no_tls_hosts (#1450)

#### Fixes

- 2.8.0 was shipped with a broken config/plugins. (#1453)
- Stop haraka dying when ldap connections fail (#1456)
- Pick up domain specific config correctly in ldap (#1456)

### 2.8.0 - May 06, 2016

#### Changes

- updated dependency versions (#1426, #1425)
- use utf8 encoding for body filters (#1429)
- remove spameatingmonkey from tests (#1421)
- replace ./constants.js with haraka-constants (#1353)
- Document HMail and TODO items (#1343)
- Copy only a minimal config/* by default (#1341).
- cfreader/* removed to haraka/haraka-config (#1350)
- outbound and smtp_client honor tls.ini settings (#1350)
- outbound TLS defaults to enabled
- lint: remove all unused variables (#1358)
- replace ./address.js with address-rfc2181 (#1359)

#### New Features

- smtp_forward: accepts a list of backend hosts, thanks @kgeoss (#1333)
- config: add array[] syntax to INI files (#1345)
- plugins.js: support require('./config') in plugins
- Load plugin config from own folder and merge (#1335)
- Allow original email's Subject to be included in bounce message (#1337)
- new queue/smtp_bridge plugin, thanks @jesucarr (#1351)

#### Improvements

- early_talker: supports IP whitelisting (#1423)
- loading plugins as packages (#1278)
- removed TLD stuff to haraka/haraka-tld (#1301)
- removed unused 'require('redis') in plugins/karma (#1348)
- improved MIME header support per rfc2231 (#1344)
- tls options can be defined for outbound and smtp_* (#1357)
- explicitly disable SSLv2 (#1395)
- cache STUN results
- xclient plugin improvements (#1405)
- tls: Set verify=NO correctly when no certificate presented (#1400)
- improved message header decoding (#1403, #1406)
- bounce: skip single_recipient check for relays/private_ips (#1385)
- rspamd docs: Clarify usage of check.private_ip (#1383)
- if rcpt_to returns DSN in msg, log it properly (#1375)

#### Fixes

- fix out-of-range errors from banner insertion (#1334)
- dkim_verify: Call next only after message_stream ended (#1330)
- outbound: remove type check from pid match (#1322)
- lint: enable no-shadown and remove all shadow variables (#1349)
- spf: fix log_debug syntax (#1416)
- auto_proxy: fix a starttls loop (#1392)
- fcrdns: corrected err variable name (#1391)
- rspamd: Fix undefined variable (#1396)
- dkim_verify: Fix header handling (#1371)
- smtp_client: fix remote_ip (#1362)

### 2.7.3 - Feb 04, 2016

#### Changes

- smtp_proxy & qmail-queue: default to enabled for outbound deliveries (previously used Outbound), to better matches user expectations.

#### New Features

- outbound: allow passing notes to send_email (#1295)

#### Improvements

- logging: emit log message queue before shutting down (#1296)
- result_store: permit redis pub/sub to work when host != localhost (#1277)
- tests: quiet the extremely verbose messages (#1282)
- rspamd: add timeout error handling (#1276)
- watch: fix display of early_talker results (#1281)
- spamassassin: publish results to result_store (#1280)
- karma: can now connect to redis on hosts other than localhost (#1275)
- geoip & p0f: don't log empty/null values from RFC 1918 connects (#1267)
- redis: make plugin params match docs (#1273)
- mailbody: small refactoring (#1315)
- smtp_proxy & qmail-queue: default to enabled for outbound (#1308)

#### Fixes

- redis: use correct path for db.select (#1273)
- count errors correctly (#1274)
- logger: ignore null arguments (#1299)
- connection: pause for hook_reset_transaction (#1303)
- rcpt_to.routes: update redis usage for compat with redis plugin (#1302)
- smtp_forward: use correct config path to auth settings (#1327)
- messagestream: correctly pass options parameter to get_data (#1316)
- spf: honour configuration for mfrom scope (#1322)
- outbound: Add missing dash to 'Final-Recipient' header name (#1320)

### 2.7.2 - Dec 15, 2015

#### Fixes

- Revert a change that broke plugin loading

### 2.7.1 - Dec 14, 2015

#### New Features

- added debian init.d file (#1255) @slattery

#### Improvements

- smtp_forward auth settings now work (#430)
- better handling of broken messages (#1234)
- Docker: use latest Phusion image && stdout (#1238, #1239)
- Clean up plugin loading a tiny bit (#1242)
- make dkim keydir case insensitive (1251)
- ignore DNS errors that aren't errors (#1247)
- outbound doc updates (#1258) @Currerius
- outbound: return DENYSOFT on queue error (#1264)
- smtp_client: if enable_tls is set and TLS files missing, warn (#1266)

#### Fixes

- Don't sent empty headers to rspamd (#1230)
- Fix auth_base.js key need to be a string - number.toString() (#1228)
- fix bug with empty charset= on mime parts … (#1225)
- Fix "passwd" check crash with numeric password. (#1254)
- result_store: show arrays when not empty (#1261)

### 2.7.0 - Oct 07, 2015

#### New Features

- SPF bounce check
- rspamd plugin (@fatalbanana)
- watch plugin
- limit plugin (connection concurrency, errors, unrecognized commands)
- plugins can now be npm packages (see also #946)
- built-in HTTP server (Express backed)
- ESETS AV plugin
- DCC plugin (incomplete)
- Add LOGIN support to XCLIENT
- backscatterer plugin
- full IPv4 & IPv6 compatibility inbound #1120, #1123, #1154 (@Dexus)
- Early talker #1075 (@smfreegard, @msimerson)
- permit loading of plugins in node_modules #1056 (@msimerson)

#### Improvements

- Fix anti_spoof by use config #1171
- Add license clause #1170
- package.json dependencies and travis update #1147, #1168 (@Dexus)
- logging: remove node-syslog and strong-fork-syslog with modern-syslog #1145 (@Dexus)
- aliases: support for email, user and host aliases #1149 (@Dexus)
- add docs for use private key with TLS #1130 (@Dexus)
- outbound: ENOENT on dotfile - compatibility for windows #1129 (@Dexus)
- plugin/attachment: block more attachment file types #1191 (@Dexus)
- remove double functions #1126 (@Dexus)
- Outbound Bounce messages according to RFC3464 #1189 (@hatsebutz)
- toobusy: only run checks if toobusy.js installed and loads
- HAProxy: set local_ip, local_port and remote_port
- save auth pass/fail/user to result_store
- ini files no longer require values (useful for storing lists)
- connection: add MAIL and RCPT to results
- results_store: enable 'emit' feature for .push()
- add support for custom Outbound Received header value (@zombified)
- save smtp_forward result to result_store
- auth_base: permit a return message (@DarkSorrow)
- add DSN.create() and RFC 4954 support
- enhanced pipelining support
- added config/access.domains with some tips (@EyePulp)
- Add SSL detection over plain-text socket
- earlytalker: store results
- bounce: make it safe to check non_local_msgid
- AVG: store results, added defer options
- tls: change createCredentials to tls.createSecureContext (@DarkSorrow)
- update dependency versions (esp async 0.2.9 -> 1.0.0)
- ASN docs: add FTP download note for routeviews
- karma: removed concurrency limits (see limit plugin) and penalty feature
- added utils.elapsed()
- deny message includes hostname
- Add Fisher-Yates shuffle to randomize lookup order in data.uribl
- change default message size limit to 25mb
- auth_base: save auth results
- upgrade toobusy plugin to toobusy-js (@alexkavon)
- configfile: permit / char in ini keys
- added utils.node_min()
- added result_store.get_all()
- updated ubuntu upstart script
- plugin/rate_limit: return in no custom default is set 0 = unlimited #1186, #1185
- Outbound.send_email: added dot-stuffing #1176, #1165 (@hatsebutz)
- make sure server object is availabe to plugins loaded from node_modules #1162 (@bmonty)
- Net_utils.get_ips_by_host #1160 (@msimerson)
- fcrdns: don't log error for ENODATA #1140 (@msimerson)
- improve MUA detection #1137 (@msimerson)
- tls: tmp disable for hosts that fail STARTTLS #1136 (@msimerson)
- karma: skip deny on outbound hooks #1100 (@msimerson)
- Store HAProxy IP in connection object #1097 (@smfreegard)
- Remove UUID from queued message #1092 (@smfreegard)

#### Fixes

- fix windows build and test failures #1076 (@msimerson)
- Fix plugin ordering #1081 (@smfreegard)
- Fix distance reporting to X-Haraka-GeoIP for geoip-lite #1086 (@smfreegard)
- uribl: prevent calling next() more than 1x #1138 (@msimerson)
- Fix so constants are imported when plugin is loaded from node_modules. #1133 (@bmonty)
- Include STMP-code in bounce-reason string for upstream 5XX responses #1117 (@hatsebutz)
- TLS fixes: add timed_out flag and karma should not run deny hook on it. #1109 (@smfreegard)
- Fix port to number instead of string for HAProxy #1108 (@DarkSorrow)
- Plugin dcc: fixed syntax error #1164 (@hatsebutz)
- config: fix flat files if \r\n lines #1187 (@Dexus)
- corrected hook_rcpt log code hook_rcpt_ok returns CONT
- fix crash bug when loglevel = LOGDEBUG
- corrected pathname in rcpt.ldap plugin (@abhas)
- added helo.checks boolean for proto_mismatch
- make rate_limit redis keys always expire @celesteking
- dkim_sign: Buffer.concat expects an array of buffers
- transaction: check discard_data before adding line end (@DarkSorrow)
- fix 8-bit msg not displayed properly in gmail
- fcrdns: always init results
- TLS timer on error
- dkim_verify: fixed timeout issue
- smtp\_[proxy|forward]: correct authentication example
- Fork child workers after init_master hook
- connection: return 450/550 for plugin DENY* (was 452/552)
- spamassassin: don't call next() when transaction gone
- outbound: fix crash when sending bounce mail
- auth_base: fix bad protocol in auth_base.js #1121 (@Dexus)
- outbound: Fix HELO/rDNS issue while using multiple outbound ip #1128 (@Dexus)
- connection: Fix bug when client disconnect after sending data #1193
- Fix connect.geoip bug #1144 (@smfreegard)
- Fix tiny bug in messagesniffer #1198 (@smfreegard)

### 2.6.1 - Mar 27, 2015

- added sedation timers for config file re-reading
- Add AUTH support to outbound
- tests/spf: quiet excessive DEBUG noise
- allow domains with underscore
- correct name of domains config file in access
- Fix SMTP AUTH in smtp_forward/proxy and add docs
- Fix opts not being passed to HMailItem \_bounce function
- log.syslog will try strong-fork-syslog (for node 0.12 compat)
- improvements to Plugin docs
- rename net_utils.is_rfc1918 -> is_private_ip
  - IPv6 compat
  - test coverage
  - add IPv6 unique local fc00::/7
- pre-populated config/plugins
- added utils.extend, copies props onto objects

### 2.6.0 - Feb 21, 2015

- other bug fixes
- updated a few tests so test suite passes on Windows
- log.syslog: handle failure to load node-syslog
- plugin directory is $ENV definable (@martin1yness)
- logging timestamps were static, fixed by @cloudbuy
- queue/rabbitmq_amqplib, new plugin for RabbitMQ using amqplib (@esevece)
- outbound:
  - plugins can set the outbound IP (during get_mx)
  - only replace line endings if not \r\n
  - bannering fixes
  - added support for per recipient routes
- tls: don't register hooks upless certs exist
- removed contrib/geolite-mirror-simple.pl (replaced by
  docs update pointing to maxmind-geolite-mirror)
- rcpt.routes: new plugin by @msimerson
- make haproxy IPv6 compatible
- record_envelope_addresses: new plugin by @deburau
- prevent_credential_leaks: new plugin by @smfreegard
- config:
  - configfile: added .yaml support
  - improved config file 'watch' logic
  - Allow hyphens in params in config files (@abhas)
  - cached requests include options in cache key name
- asn: updates for node 0.11 compat
- dnsbl: use aysync.each vs forEach (avoid race condition)
- spamassassin: improved config loading and test coverage
- geoip: deprecate geoip-lite in favor of maxmind, IPv6 compatible
- disable SSLv3 (due to POODLE)
- dkim & spf, updates for node 0.11 compatibiilty
- karma: move neighbor scoring from code to karma.ini
  - move excludes list to karma.ini
  - apply awards before adding message header & permit rejection at queue
  - karma.ini: score updates for access & uribl plugins
  - score denials issued by skipped plugins
  - add scores for specific DNSBLs
- add transaction body filters (@chazomaticus)
  - change bannering to use them
- helo.checks: fix timeout bug
  - match_re now validates and pre-compiles all REs
  - Add new proto_mismatch check
- p0f: add register(), load config once, early
- server: improved config handling
- data.headers: add Delivered-To check
- rcpt_to.ldap: new plugin by @abhas
- smtp*client: only load tls*- when cfg.enable_tls
- added plugins/host_list_base
- Platform independent temp dir (thanks @martinvd)
- move deprecated docs into docs/deprecated
- Switch to Phusion baseimage instead of stock Ubuntu (thanks @Synchro)
- dkim_verify: new plugin by @smfreegard
- many new tests
- improved URI parser (for URIBL plugin)
- Allow mixed case STARTTLS command
- Install Node via package manager (Mohd Rozi)
- Fix a couple crit errors (@Illirgway)
- Add noisy/bulk out-of-band rule support to MessaageSniffer plugin
- initial support for rabbitmq plugin (@samuelharden)
- bounce, added non_local_msgid checks and much faster lookups
- vpopmail: fail faster during a CRAM-MD5 auth attempt with an invalid user
- fcrdns: handle a null hostname
- Improve HAProxy support code and documentation
- tls: reworked for efficiency and linear style
- access: test hostname validity before PSL lookup
  - load lists into objects (vs arrays), for much faster runtime access
- host_list: huge performance increase, esp for many hosts

### 2.5.0 - May 24, 2014

- added automated build testing via Travis-CI.org
- fixed dkim_sign crash issue #560
- geoip can discover external IP via net_utils.get_public_ip
- geoip: skip private IPs
- qmd: when relaying, validate MAIL FROM against QMD, add per-domain
  configurations, added reject option, added tests and bug fixes.
- net_utils: added is_ipv4_literal, is_public_suffix, get_public_ip, added
  tests, shed some CamelCase.
- asn: looksup up ASN of connection, uses 3 providers, tests providers, saves
  results, optionally adds headers. Includes tests.
- access: new plugin that merges rdns_access, mail_from.access, and
  rcpt_to.access.
- fcrdns: new plugin (Forward Confirmed Reverse DNS)
- bounce: new plugin (merges
- data.headers: new plugin added direct_to_mx, check & reject settings, added MLM detection,
  tests.
- helo.checks: refactored, better config handling, new tests (match_rdns,
  mismatch, results), reject option.
- results_store: store processing results in data structures (vs notes)
- spf: refactored, added outbound checks when relaying, added 15 tests,
- dnsbl: return errors as Error objects, reduce list to unique zones, added
  tests, added search=multi option, handle ENOTFOUND error, added reject=false option.
- dns_list_base: bug fixes (race condition, returning invalid results)
- bounce: refactored, each check has enable and reject switches, added tests,
  added bad_bounce_to
- clamav: add virus name to results, better config parsing, typo fixes
- uribl:
- mf_resolvable:
- tls: add link to wiki article on TLS setup
- relay_acl: fix issue #428, refactored, don't crash when relay_dest_domains.ini
  missing, added tests
- fix mx mechanism when no records are returned
- vpopmaild: added per-domain feature
- karma: added whitelist award, pass through temp (DENYSOFT) errors, made
  tarpit variable, configurable reject hooks, doc rewrite, ASN awards, fix penalty days calculation, new DSL for karma awards,
- bannering fixes
- added log* stubs to test/fixtures/[plugin|connection]
- tests/fixtures/stub_plugin: set name property
- config: corrected handling of config.arg gets, fix caching bug, fix boolean
  handling, added missing 'type' handling.
- Adding the option of using CIDR ranges in the haproxy_hosts file
- tarpit: added config option hooks_to_delay, added docs
- contrib/haraka.bsd.rc: startup file for *BSD
- Store attachment headers on stream
- Record accepted domains at hook_rcpt and improve queue/lmtp
- return after next() in the whitelist checks
- Add new -o option to bin/haraka

### 2.4.0 - Feb 12, 2014

- Trim whitespace when reading "list" type config files (such as config/plugins)
- Added LMTP via queue/lmtp plugin
- Fixed bug in outbound when temp failing some of the recipients that would prevent delivery working to those recipients for future delivery attempts
- Add additional details/parameters to delivered hook for outbound mail
- Removed the hmail.bounce_extra object as that information now stored with the rcpt_to list
- Store the RCPT TO rejection reason on the address object

### 2.3.0 - Feb 07, 2014

- Fix memory leak when watching config files for changes
- Support for badly formatted MAIL FROM/RCPT TO lines
- Fix a memory corruption when fixing line endings
- Fix breakpoints in plugins when using node inspector
- Reload config in relay_force_routing without restart
- Don't re-attempt TLS upgrade if upgraded already and STARTTLS is re-advertised
- Improved outbound logging
- Pass failed recipients to bounce hook in outbound processing
- Added startup checks to ensure Haraka has been installed correctly
- Handle case of Haraka server running out of disk space better
- In mail_from.is_resolvable: move re_bogus_ip into config
- Added auth/auth_vpopmaild plugin - SMTP AUTH against a vpopmaild server
- Fixed graph plugin to work with sqlite3
- Added rcpt_to.qmail_deliverable plugin - Authenticate inbound RCPT TOs against Qmail::Deliverable daemon
- Added data.headers plugin which merges header checks into one place.
  Deprecates data.noreceived, data.rfc5322_header_checks, and data.nomsgid.
- Added documentation for logging system
- Added DKIM per-domain signing support
- Added p0f plugin
- In relay_acl, if host is allowed by acl, don't deny the recipient because the domain isn't in the allow list
- Add Authentication-Results header (RFC 5451) to all emails
- Fixed writing the todo file in outbound for newer Node versions
- Added Karma plugin to support penalizing consistently evil senders
- Added GeoIP plugin including distance calculation from your mail server
- Added bounce plugin for handling incoming bounce messages in various ways
- Fix underscores in documentation so web version doesn't look so weird
- By default prevent SMTP AUTH unless on a private IP or using TLS WARNING: May break some uses of Haraka, but is worth it for security
- In lookup_rdns.strict, check whitelist before looking up IP
- Big rewrite of the SpamAssassin plugin for simplicity and mainly to pass through X-Spam-* headers provided
- Added delay_deny plugin allowing more flexibility on when to reject mail
- Improvements to ini file parsing allowing floats and negative integers, and specifying boolean keys
- Fix issue causing a CRIT/crash with lost transaction/connection while sending inbound to ongoing SMTP server
- Allow setting of spamd_user for spamassassin plugin

### 2.0.0 - Nov 28, 2012

- Various fixes to SMTP AUTH code, including providing SMTP AUTH to inbound
  mail forwarders.
- Updates to process_title plugin to show more details
- Changed transaction.data_lines to a Stream (this will break all code which
  uses transaction.data_lines currently - see the migration guide)
- Changed attachments to be a Stream (this will break some code which uses
  transaction.attachment_hooks - see the migration guide)
- Capture and log signals sent to Haraka
- Various performance improvements
- Fixed a memory leak in connection pool
- Improvements to TLS compatibility
- RFC compliance improvements with greeting, EHLO/HELO, QUIT, and dot stuffing
- Throw exception with set_banner as it is now non-functional. Will be returned in a future version.
- Small fixes to data.uribl


[3.0.0]: https://github.com/haraka/Haraka/releases/tag/3.0.0
[3.0.1]: https://github.com/haraka/Haraka/releases/tag/v3.0.1
[3.0.2]: https://github.com/haraka/Haraka/releases/tag/v3.0.2
[3.0.3]: https://github.com/haraka/Haraka/releases/tag/v3.0.3
[3.0.4]: https://github.com/haraka/Haraka/releases/tag/3.0.4
[3.0.5]: https://github.com/haraka/Haraka/releases/tag/v3.0.5
[3.0.6]: https://github.com/haraka/Haraka/releases/tag/v3.0.6

[2.8.0]: https://github.com/haraka/Haraka/releases/tag/v2.8.0
[2.8.1]: https://github.com/haraka/Haraka/releases/tag/v2.8.1
[2.8.3]: https://github.com/haraka/Haraka/releases/tag/v2.8.3
[2.8.4]: https://github.com/haraka/Haraka/releases/tag/v2.8.4
[2.8.5]: https://github.com/haraka/Haraka/releases/tag/v2.8.5
[2.8.6]: https://github.com/haraka/Haraka/releases/tag/v2.8.6
[2.8.7]: https://github.com/haraka/Haraka/releases/tag/v2.8.7
[2.8.8]: https://github.com/haraka/Haraka/releases/tag/v2.8.8
[2.8.9]: https://github.com/haraka/Haraka/releases/tag/v2.8.9
[2.8.10]: https://github.com/haraka/Haraka/releases/tag/2.8.10
[2.8.11]: https://github.com/haraka/Haraka/releases/tag/2.8.11
[2.8.12]: https://github.com/haraka/Haraka/releases/tag/2.8.12
[2.8.13]: https://github.com/haraka/Haraka/releases/tag/2.8.13
[2.8.14]: https://github.com/haraka/Haraka/releases/tag/v2.8.14
[2.8.15]: https://github.com/haraka/Haraka/releases/tag/2.8.15
[2.8.16]: https://github.com/haraka/Haraka/releases/tag/2.8.16
[2.8.17]: https://github.com/haraka/Haraka/releases/tag/2.8.17
[2.8.18]: https://github.com/haraka/Haraka/releases/tag/2.8.18
[2.8.19]: https://github.com/haraka/Haraka/releases/tag/v2.8.19
[2.8.20]: https://github.com/haraka/Haraka/releases/tag/2.8.20
[release-2.8.21]: https://github.com/haraka/Haraka/releases/tag/release-2.8.21
[2.8.22]: https://github.com/haraka/Haraka/releases/tag/2.8.22
[2.8.24]: https://github.com/haraka/Haraka/releases/tag/2.8.24
[2.8.25]: https://github.com/haraka/Haraka/releases/tag/2.8.25
[2.8.26]: https://github.com/haraka/Haraka/releases/tag/2.8.26
[2.8.27]: https://github.com/haraka/Haraka/releases/tag/2.8.27
[2.8.28]: https://github.com/haraka/Haraka/releases/tag/2.8.28

[2.7.3]: https://github.com/haraka/Haraka/releases/tag/v2.7.3
[2.7.2]: https://github.com/haraka/Haraka/releases/tag/v2.7.2
[2.7.1]: https://github.com/haraka/Haraka/releases/tag/v2.7.1
[2.7.0]: https://github.com/haraka/Haraka/releases/tag/v2.7.0

[2.6.0]: https://github.com/haraka/Haraka/releases/tag/v2.6.0
[2.6.1]: https://github.com/haraka/Haraka/releases/tag/v2.6.1
[2.5.0]: https://github.com/haraka/Haraka/releases/tag/v2.5.0
[2.4.0]: https://github.com/haraka/Haraka/releases/tag/v2.4.0
[2.3.1]: https://github.com/haraka/Haraka/releases/tag/v2.3.1
[2.3.0]: https://github.com/haraka/Haraka/releases/tag/v2.3.0
[2.2.0]: https://github.com/haraka/Haraka/releases/tag/v2.2.0
[2.2.1]: https://github.com/haraka/Haraka/releases/tag/v2.2.1
[2.2.2]: https://github.com/haraka/Haraka/releases/tag/v2.2.2
[2.2.3]: https://github.com/haraka/Haraka/releases/tag/v2.2.3
[2.2.4]: https://github.com/haraka/Haraka/releases/tag/v2.2.4
[2.2.5]: https://github.com/haraka/Haraka/releases/tag/v2.2.5
[2.2.6]: https://github.com/haraka/Haraka/releases/tag/v2.2.6
[2.2.7]: https://github.com/haraka/Haraka/releases/tag/v2.2.7
[2.2.8]: https://github.com/haraka/Haraka/releases/tag/v2.2.8
[2.1.0]: https://github.com/haraka/Haraka/releases/tag/v2.1.0
[2.1.1]: https://github.com/haraka/Haraka/releases/tag/v2.1.1
[2.1.2]: https://github.com/haraka/Haraka/releases/tag/v2.1.2
[2.1.3]: https://github.com/haraka/Haraka/releases/tag/v2.1.3
[2.1.4]: https://github.com/haraka/Haraka/releases/tag/v2.1.4
[2.1.5]: https://github.com/haraka/Haraka/releases/tag/v2.1.5
[2.1.6]: https://github.com/haraka/Haraka/releases/tag/v2.1.6

[2.0.0]: https://github.com/haraka/Haraka/releases/tag/v2.0.0
[2.0.3]: https://github.com/haraka/Haraka/releases/tag/v2.0.3
[2.0.4]: https://github.com/haraka/Haraka/releases/tag/v2.0.4
[2.0.5]: https://github.com/haraka/Haraka/releases/tag/v2.0.5

[1.0.1]: https://github.com/haraka/Haraka/releases/tag/v1.0.1
[1.0.2]: https://github.com/haraka/Haraka/releases/tag/v1.0.2
[1.1.0]: https://github.com/haraka/Haraka/releases/tag/v1.1.0
[1.2.0]: https://github.com/haraka/Haraka/releases/tag/v1.2.0
[1.2.1]: https://github.com/haraka/Haraka/releases/tag/v1.2.1
[1.3.0]: https://github.com/haraka/Haraka/releases/tag/v1.3.0
[1.3.1]: https://github.com/haraka/Haraka/releases/tag/v1.3.1
[1.3.2]: https://github.com/haraka/Haraka/releases/tag/v1.3.2
[1.3.3]: https://github.com/haraka/Haraka/releases/tag/v1.3.3
[1.4.0]: https://github.com/haraka/Haraka/releases/tag/v1.4.0

[0.9.0]: https://github.com/haraka/Haraka/releases/tag/v0.9.0
[0.8.0]: https://github.com/haraka/Haraka/releases/tag/v0.8.0
[0.7.2]: https://github.com/haraka/Haraka/releases/tag/v0.7.2
[0.7.1]: https://github.com/haraka/Haraka/releases/tag/v0.7.1
[0.7.0]: https://github.com/haraka/Haraka/releases/tag/v0.7.0
[0.6.1]: https://github.com/haraka/Haraka/releases/tag/v0.6.1
[0.6.0]: https://github.com/haraka/Haraka/releases/tag/v0.6.0
[0.5.11]: https://github.com/haraka/Haraka/releases/tag/v0.5.11
[0.5.10]: https://github.com/haraka/Haraka/releases/tag/v0.5.10
[0.5.9]: https://github.com/haraka/Haraka/releases/tag/v0.5.9
[0.5.8]: https://github.com/haraka/Haraka/releases/tag/v0.5.8
[0.5.7]: https://github.com/haraka/Haraka/releases/tag/v0.5.7
[0.5.6]: https://github.com/haraka/Haraka/releases/tag/v0.5.6
[0.5.5]: https://github.com/haraka/Haraka/releases/tag/v0.5.5
[0.5.4]: https://github.com/haraka/Haraka/releases/tag/v0.5.4
[0.5.3]: https://github.com/haraka/Haraka/releases/tag/v0.5.3
[0.5.2]: https://github.com/haraka/Haraka/releases/tag/v0.5.2
[0.5]: https://github.com/haraka/Haraka/releases/tag/v0.5
[0.4]: https://github.com/haraka/Haraka/releases/tag/v0.4
[0.3]: https://github.com/haraka/Haraka/releases/tag/v0.3
[0.2]: https://github.com/haraka/Haraka/releases/tag/v0.2
[3.1.1]: https://github.com/haraka/Haraka/releases/tag/v3.1.1
[3.1.0]: https://github.com/haraka/Haraka/releases/tag/v3.1.0
