data.headers
==========================

This plugin performs sanity checks on mail headers.

RFC 5322 Section 3.6:
---------------------

All messages MUST have a 'Date' and 'From' header and a message may not contain
more than one 'Date', 'From', 'Sender', 'Reply-To', 'To', 'Cc', 'Bcc',
'Message-Id', 'In-Reply-To', 'References' or 'Subject' header.

The default list of required and singular headers can be customized in
config/data.headers.ini.

Any message that does not meet the configured requirements will be rejected.


Date Validity
-------------------

This plugin also tests the contents of the Date field, assuring that the
timestamps in the Date field are neither too old (default: 15 days), nor
too far in the future (default: 2 days).
