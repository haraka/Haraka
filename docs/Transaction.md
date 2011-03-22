Transaction Object
==================

An SMTP transaction is valid from MAIL FROM time until RSET or "final-dot".

API
---

* transaction.mail\_from

The value of the MAIL FROM command

* transaction.rcpt\_to

An Array of values of recipients from the RCPT TO command

* transaction.data\_lines

An Array of the lines of the email after DATA

* transaction.data\_bytes

The number of bytes in the email after DATA

* transaction.add_header(key, value)

Adds a header to the email

* transaction.add_data(line)

Adds a line of data to the email

* transaction.notes

A safe place to store transaction specific values.

