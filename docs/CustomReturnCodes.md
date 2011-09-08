Custom Return Codes
===================

All plugins return constants back to Haraka to denote how the client should be 
responded to for a particular hook.  

These constants include DENY, DENYSOFT and DENYDISCONNECT which will 
automatically output an appropriate SMTP status code (e.g. 450 temporary 
failures for DENYSOFT or 550 permanent failures for DENY or DENYDISCONNECT) in 
the SMTP response sent back to the client along with an optional message text 
that you return as arguments to the next() function.

The **DSN** module was designed to allow a plugin to return RFC 3463 compliant 
extended status codes and to allow a plugin author to override the SMTP status 
code returned by Haraka.

The DSN module exposes a callable function for each status condition defined 
in RFC 3463.

Please refer to [RFC 3463](http://tools.ietf.org/html/rfc3463) for further 
information and background.


###Using the DSN module in your plugin

Firstly you need to load the DSN module by adding the following line to 
the top of your plugin:

	var DSN = require('./dsn');

Then instead of:

	return next(DENY, 'No such user');

You can call the DSN module and return that in place of optional message 
argument of next():

	return next(DENY, DSN.no_such_user());

This will cause Haraka to return the following back to the client:

	550 5.1.1 No such user

The DSN functions are used like this:

	DSN.<function name>([message], [code]); 

The function name is required and maps to the list of defined status codes 
in RFC 3463.  All of the available functions are detailed in the table below.

[message] is optional and should contain the message that you would like to be 
returned to the client, this value can be a string or an array which can 
contain multiple elements which will cause a multi-line reply to be sent to the client.
If a message is not supplied, then the default message for the DSN function 
will be used.

[code] is optional and should be a numeric SMTP status code that should be 
returned to the client.


###Available DSN functions

<table width="100%" border=1>
 <tr>
  <th align="left">Function</th>
  <th>Default SMTP Status Code</th>
  <th>Enhanced Status Code</th>
  <th align="left">Default Message</th>
 </tr>
 <tr>
  <th colspan=5>Class:  Other or Undefined Status X.0.0</th>
 </tr>
 <tr>
  <td>unspecified</td>
  <td align="center">450</td>
  <td align="center">X.0.0</td>
  <td>Other undefined status</td>
 </tr>
 <tr>
  <th colspan=5>Class:  Addressing Status X.1.X</th>
 </tr>
 <tr>
  <td>addr_unspecified</td>
  <td align="center">450</td>
  <td align="center">X.1.0</td>
  <td>Other address status</td>
 </tr>
 <tr>
  <td>addr_bad_dest_mailbox</td>
  <td align="center">550</td>
  <td align="center">X.1.1</td>
  <td>Bad destination mailbox address</td>
 </tr>
 <tr>
  <td>addr_bad_dest_system</td>
  <td align="center">550</td>
  <td align="center">X.1.2</td>
  <td>Bad destination system address</td>
 </tr>
 <tr>
  <td>addr_bad_dest_syntax</td>
  <td align="center">550</td>
  <td align="center">X.1.3</td>
  <td>Bad destination mailbox address syntax</td>
 </tr>
 <tr>
  <td>addr_dest_ambigous</td>
  <td align="center">450</td>
  <td align="center">X.1.4</td>
  <td>Destination mailbox address ambiguous</td>
 </tr>
 <tr>
  <td>addr_rcpt_ok</td>
  <td align="center">220</td>
  <td align="center">X.1.5</td>
  <td>Destination address valid</td>
 </tr>
 <tr>
  <td>addr_mbox_mobed</td>
  <td align="center">550</td>
  <td align="center">X.1.6</td>
  <td>Destination mailbox has moved, No forwarding address</td>
 </tr>
 <tr>
  <td>addr_bad_from_syntax</td>
  <td align="center">550</td>
  <td align="center">X.1.7</td>
  <td>Bad sender&quot;s mailbox address syntax</td>
 </tr>
 <tr>
  <td>addr_bad_from_system</td>
  <td align="center">550</td>
  <td align="center">X.1.8</td>
  <td>Bad sender&quot;s system address</td>
 </tr>
 <tr>
  <th colspan=4>Class:  Mailbox Status X.2.X</th>
 </tr>
 <tr>
  <td>mbox_unspecified</td>
  <td align="center">450</td>
  <td align="center">X.2.0</td>
  <td>Other or undefined mailbox status</td>
 </tr>
 <tr>
  <td>mbox_disabled</td>
  <td align="center">550</td>
  <td align="center">X.2.1</td>
  <td>Mailbox disabled, not accepting messages</td>
 </tr>
 <tr>
  <td>mbox_full</td>
  <td align="center">450</td>
  <td align="center">X.2.2</td>
  <td>Mailbox full</td>
 </tr>
 <tr>
  <td>mbox_msg_too_long</td>
  <td align="center">550</td>
  <td align="center">X.2.3</td>
  <td>Message length exceeds administrative limit</td>
 </tr>
 <tr>
  <td>mbox_list_expansion_problem</td>
  <td align="center">450</td>
  <td align="center">X.2.4</td>
  <td>Mailing list expansion problem</td>
 </tr>
 <tr>
  <th colspan=4>Class:  Mail System Status X.3.X</th>
 </tr>
 <tr>
  <td>sys_unspecified</td>
  <td align="center">450</td>
  <td align="center">X.3.0</td>
  <td>Other or undefined mail system status</td>
 </tr>
 <tr>
  <td>sys_disk_full</td>
  <td align="center">450</td>
  <td align="center">X.3.1</td>
  <td>Mail system full</td>
 </tr>
 <tr>
  <td>sys_not_accepting_mail</td>
  <td align="center">450</td>
  <td align="center">X.3.2</td>
  <td>System not accepting network messages</td>
 </tr>
 <tr>
  <td>sys_not_supported</td>
  <td align="center">450</td>
  <td align="center">X.3.3</td>
  <td>System not capable of selected features</td>
 </tr>
 <tr>
  <td>sys_msg_too_big</td>
  <td align="center">550</td>
  <td align="center">X.3.4</td>
  <td>Message too big for system</td>
 </tr>
 <tr>
  <td>sys_incorrectly_configured</td>
  <td align="center">450</td>
  <td align="center">X.3.5</td>
  <td>System incorrectly configured</td>
 </tr>
 <tr>
  <th colspan=4>Class: Network and Routing Status X.4.X</th>
 </tr>
 <tr>
  <td>net_unspecified</td>
  <td align="center">450</td>
  <td align="center">X.4.0</td>
  <td>Other or undefined network or routing status</td>
 </tr>
 <tr>
  <td>net_no_answer</td>
  <td align="center">450</td>
  <td align="center">X.4.1</td>
  <td>No answer from host</td>
 </tr>
 <tr>
  <td>net_bad_connection</td>
  <td align="center">450</td>
  <td align="center">X.4.2</td>
  <td>Bad connection</td>
 </tr>
 <tr>
  <td>net_directory_server_failed</td>
  <td align="center">450</td>
  <td align="center">X.4.3</td>
  <td>Directory server failure</td>
 </tr>
 <tr>
  <td>net_unable_to_route</td>
  <td align="center">550</td>
  <td align="center">X.4.4</td>
  <td>Unable to route</td>
 </tr>
 <tr>
  <td>net_system_congested</td>
  <td align="center">450</td>
  <td align="center">X.4.5</td>
  <td>Mail system congestion</td>
 </tr>
 <tr>
  <td>net_routing_loop</td>
  <td align="center">550</td>
  <td align="center">X.4.6</td>
  <td>Routing loop detected</td>
 </tr>
 <tr>
  <td>net_delivery_time_expired</td>
  <td align="center">550</td>
  <td align="center">X.4.7</td>
  <td>Delivery time expired</td>
 </tr>
 <tr>
  <th colspan=4>Class:  Mail Delivery Protocol Status X.5.X</th>
 </tr>
 <tr>
  <td>proto_unspecified</td>
  <td align="center">450</td>
  <td align="center">X.5.0</td>
  <td>Other or undefined protocol status</td>
 </tr>
 <tr>
  <td>proto_invalid_command</td>
  <td align="center">550</td>
  <td align="center">X.5.1</td>
  <td>Invalid command</td>
 </tr>
 <tr>
  <td>proto_syntax_error</td>
  <td align="center">550</td>
  <td align="center">X.5.2</td>
  <td>Syntax error</td>
 </tr>
 <tr>
  <td>proto_too_many_recipients</td>
  <td align="center">450</td>
  <td align="center">X.5.3</td>
  <td>Too many recipients</td>
 </tr>
 <tr>
  <td>proto_invalid_cmd_args</td>
  <td align="center">550</td>
  <td align="center">X.5.4</td>
  <td>Invalid command arguments</td>
 </tr>
 <tr>
  <td>proto_wrong_version</td>
  <td align="center">450</td>
  <td align="center">X.5.5</td>
  <td>Wrong protocol version</td>
 </tr>
 <tr>
  <th colspan=4>Class: Message Content or Media Status X.6.X</th>
 </tr>
 <tr>
  <td>media_unspecified</td>
  <td align="center">450</td>
  <td align="center">X.6.0</td>
  <td>Other or undefined media error</td>
 </tr>
 <tr>
  <td>media_unsupported</td>
  <td align="center">550</td>
  <td align="center">X.6.1</td>
  <td>Media not supported</td>
 </tr>
 <tr>
  <td>media_conv_prohibited</td>
  <td align="center">550</td>
  <td align="center">X.6.2</td>
  <td>Conversion required and prohibited</td>
 </tr>
 <tr>
  <td>media_conv_unsupported</td>
  <td align="center">450</td>
  <td align="center">X.6.3</td>
  <td>Conversion required but not supported</td>
 </tr>
 <tr>
  <td>media_conv_lossy</td>
  <td align="center">450</td>
  <td align="center">X.6.4</td>
  <td>Conversion with loss performed</td>
 </tr>
 <tr>
  <td>media_conv_failed</td>
  <td align="center">450</td>
  <td align="center">X.6.5</td>
  <td>Conversion failed</td>
 </tr>
 <tr>
  <th colspan=4>Class:  Security or Policy Status X.7.X</th>
 </tr>
 <tr>
  <td>sec_unspecified</td>
  <td align="center">450</td>
  <td align="center">X.7.0</td>
  <td>Other or undefined security status</td>
 </tr>
 <tr>
  <td>sec_unauthorized</td>
  <td align="center">550</td>
  <td align="center">X.7.1</td>
  <td>Delivery not authorized, message refused</td>
 </tr>
 <tr>
  <td>sec_list_expn_prohibited</td>
  <td align="center">550</td>
  <td align="center">X.7.2</td>
  <td>Mailing list expansion prohibited</td>
 </tr>
 <tr>
  <td>sec_conv_failed</td>
  <td align="center">550</td>
  <td align="center">X.7.3</td>
  <td>Security conversion required but not possible</td>
 </tr>
 <tr>
  <td>sec_feature_unsupported</td>
  <td align="center">550</td>
  <td align="center">X.7.4</td>
  <td>Security features not supported</td>
 </tr>
 <tr>
  <td>sec_crypto_failure</td>
  <td align="center">550</td>
  <td align="center">X.7.5</td>
  <td>Cryptographic failure</td>
 </tr>
 <tr>
  <td>sec_crypto_algo_unsupported</td>
  <td align="center">450</td>
  <td align="center">X.7.6</td>
  <td>Cryptographic algorithm not supported</td>
 </tr>
 <tr>
  <td>sec_msg_integrity_failure</td>
  <td align="center">550</td>
  <td align="center">X.7.7</td>
  <td>Message integrity failure</td>
 </tr>
 <tr>
  <th colspan=4>Convenience functions</th>
 </tr>
 <tr>
  <td>no_such_user</td>
  <td align="center">550</td>
  <td align="center">X.1.1</td>
  <td>No such user</td> 
 </tr>
 <tr>
  <td>temp_resolver_failed</td>
  <td align="center">450</td>
  <td align="center">X.4.3</td>
  <td>Temporary address resolution failure</td>
 </tr>
 <tr>
  <td>too_many_hops</td>
  <td align="center">550</td>
  <td align="center">X.4.6</td>
  <td>Too many hops</td>
 </tr>
 <tr>
  <td>bad_sender_ip</td>
  <td align="center">550</td>
  <td align="center">X.7.1</td>
  <td>Bad sender IP</td>
 </tr>
 <tr>
  <td>relaying_denied</td>
  <td align="center">550</td>
  <td align="center">X.7.1</td>
  <td>Relaying denied</td>
 </tr>
</table>
