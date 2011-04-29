Address Object
==============

The Address object is an interface to reading email addresses passed in at
SMTP time. As such it parses all the formats in RFC-2821 and 2822, and
supports correctly escaping email addresses.

API
---

* new Address (user, host)

Create a new address object for user@host

* new Address (email)

Creates a new address object by parsing the email address. Will throw an
exception if the address cannot be parsed.

* address.user

Access the local part of the email address

* address.host

Access the domain part of the email adress

* address.format()

Provides the email address in the appropriate `<user@host>` format. And
deals correctly with the null sender and local names.

* address.toString()

Same as format().

* address.address()

Provides the email address in 'user@host' format.

Advanced Usage
--------------

It is possible to mess with the regular expressions used to match addresses
for stricter or less strict matching.

To change the behaviour mess with the following variables:

    var adr = require('./address');
	// Now change one of the following. Note they are RegExp objects NOT strings.
    adr.atom_expr;
	adr.address_literal_expr;
	adr.subdomain_expr;
	adr.domain_expr;
	adr.qtext_expr;
	adr.text_expr;
	// Don't forget to recompile:
	adr.compile_re();
