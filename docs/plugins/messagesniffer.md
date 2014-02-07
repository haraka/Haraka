messagesniffer
==============

This plugin provides integration with the commerical Anti-Spam product [MessageSniffer](http://armresearch.com/products/sniffer.jsp) by Arm Research Labs using its XML Client interface [XCI](http://armresearch.com/support/articles/software/snfServer/xci/) over TCP.

Installation
------------

Install the SNF Client/Server package for your platform as per the instructions on the MessageSniffer website.

Modify your SNFServer.xml file and under the 'xheaders' section set:

* output mode='api'

This prevents MessageSniffer from adding additional headers to the temporary file used to send it the message data which is 
unnecessary as Haraka reads the headers from the XCI response.

* rulebase on-off='on'
* result on-off='on'
* black on-off='on'
* while on-off='on'
* clean on-off='on'
* all symbol on-off='on'

These cause SNFServer to send Haraka additional headers that are inserted into all messages scanned by MessageSniffer and 
will aid debugging and troubleshooting.

Once this is done start/restart the SNF server.

Configuration
-------------

This plugin uses `messagesniffer.ini` for configuration.  The `[main]` section is for global configuration, the `[gbudb]` 
section is used to specify the action that should be taken based on the GBUdb result which is checked at the start of the 
connection and the `[message]` section is used to specify the action to be taken based on the main scan result.

`[main]`

- port

    Default: 9001
    TCP port to use when communicating to the SNFServer daemon.
    This needs to match the `<xci on-off='on' port='9001'/>` value in the SNFServer.xml file.
    
- tmpdir

    Default: /tmp
    Temporary directory used to write temporary message files to that are read by the SNFServer daemon.
    This directory and the files within need to be readable by the user that SNFServer is running as.

- gbudb\_report\_deny = [ true | false | 0 | 1 ]

    Default: false
    This is an experimental option that will record a GBUdb 'bad' encounter for a connected IP address when a client 
    disconnects with no message having been sent or seen by MessageSniffer but Haraka has recorded a hard rejection at 
    some point during the session.  The idea behind this option is that it allows other Haraka plugins rejections influence 
    GBUdb IP reputation where MessageSniffer isn't seeing the actual message because it is being rejected pre-DATA.

- tag\_string

    Default: [SPAM]
    String to prepend to the Subject line if the 'tag' action is applied.

`[gbudb]`

- white = [ accept | allow | continue | retry | tempfail | reject | quarantine | tag ]

    Default: accept
    Action to take when GBUdb reports a 'white' result.

- caution = [ accept | allow | continue | retry | tempfail | reject | quarantine | tag ]

    Default: continue
    Action to take when GBUdb reports a 'caution' result.
    
- black = [ accept | allow | continue | retry | tempfail | reject | quarantine | tag ]

    Default: continue
    Action to take when GBUdb reports a 'black' result.
    
- truncate = [ accept | allow | continue | retry | tempfail | reject | quarantine | tag ]
    
    Default: reject
    Action to take when GBUdb reports a 'truncate' result.

`[message]`

- white = [ accept | allow | continue | retry | tempfail | reject | quarantine | tag ]

    Default: continue
    Action to take when MessageSniffer reports a 'white' result (result code: 0).

- local\_white = [ accept | allow | continue | retry | tempfail | reject | quarantine | tag ]

    Default: accept
    Action to take when MessageSniffer reports a local whitelist result (result code: 1).
    NOTE: You will not see this result unless you Arm support have customized your rulebase and added white rules for you.

- truncate = [ accept | allow | continue | retry | tempfail | reject | quarantine | tag ]

    Default: reject
    Action to take when MessageSniffer reports a GBUdb result of 'truncate' (result code: 20).
    NOTE: GBUdb IP lookups during the data phase can be different than the connecting IP address if you have configured 
    Source and DrillDown options in the Training section of SNFServer.xml.

- caution = [ accept | allow | continue | retry | tempfail | reject | quarantine | tag ]

    Default: continue
    Action to take when MessageSniffer reports a GBUdb result of 'caution' (result code: 40).
    NOTE: GBUdb IP lookups during the data phase can be different than the connecting IP address if you have configured 
    Source and DrillDown options in the Training section of SNFServer.xml.
    
- black = [ accept | allow | continue | retry | tempfail | reject | quarantine | tag ]

    Default: continue
    Action to take when MessageSniffer reports a GBUdb result of 'black' (result code: 63).
    NOTE: GBUdb IP lookups during the data phase can be different than the connecting IP address if you have configured 
    Source and DrillDown options in the Training section of SNFServer.xml.

- code\_NN = [ accept | allow | continue | retry | tempfail | reject | quarantine | tag ]

    NOTE: replace NN with the numeric MessageSniffer [result code](http://armresearch.com/support/articles/software/snfServer/core.jsp)
    Action to take when MessageSniffer reports a result code other than those explicitly defined above.

- nonzero = [ accept | allow | continue | retry | tempfail | reject | quarantine | tag ]

    Defalt: reject
    Action to take for any non-zero result code other than those explicity defined above.  This is a catch-all result that 
    is checked last after all other settings have been checked so you can define a code\_NN value to prevent this action from 
    being taken.

Actions
-------

* accept

    Accept the message and skip further plugins (whitelist).
    
* allow | continute

    Continue to the next plugin.
    
* retry | tempfail

    Reject the message with a temporary failure message (DENYSOFT).
    
* reject

    Reject the message with a permanent failure message (DENY).
    
* quarantine

    Continue to the next plugin.  If the message isn't rejected by another plugin - it will cause the message to be quarantined
    and the message will not be delivered to the recipient(s).
    
    NOTE: this option requires the queue/quarantine plugin in your config/plugins files and it must be listed before any 
    other queue plugins.

* tag

    Tag the subject with the default 'tag\_string' defined in the `main` section above, this will also set X-Spam-Flag: YES in 
    the message headers.   Once tagged, processing will continue to the next plugin.
    
