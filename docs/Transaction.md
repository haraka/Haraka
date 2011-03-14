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

* transaction.notes

A safe place to store transaction specific values.

