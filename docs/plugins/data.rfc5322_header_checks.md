data.rfc5322_header_checks
==========================

This plugin enforces RFC 5322 Section 3.6 which states that:

All messages MUST have a 'Date' and 'From' header and a message may not contain
more than one 'Date', 'From', 'Sender', 'Reply-To', 'To', 'Cc', 'Bcc',
'Message-Id', 'In-Reply-To', 'References' or 'Subject' header.

Any message that does not meet these requirements will be rejected.
