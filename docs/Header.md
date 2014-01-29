Header Object
=============

The Header object gives programmatic access to email headers. It is primarily
used from `transaction.header` but also each MIME part of the `Body` will
also have its own header object.

API
---

* header.get(key)

Returns the header with the name `key`. If there are multiple headers with
the given name (as is usually the case with "Received" for example) they will
be concatenated together with "\n".

* header.get\_all(key)

Returns the headers with the name `key` as an array. Multi-valued headers
will have multiple entries in the array.

* header.get\_decoded(key)

Works like `get(key)`, only it gives you headers decoded from any MIME encoding
they may have used.

* header.remove(key)

Removes all headers with the given name. DO NOT USE. This is transparent to
the transaction and it will not see the header(s) you removed. Instead use
`transaction.remove_header(key)` which will also correct the data part of
the email.

* header.add(key, value)

Adds a header with the given name and value. DO NOT USE. This is transparent
to the transaction and it will not see the header you added. Instead use
`transaction.add_header(key, value)` which will add the header to the data
part of the email.

* header.lines()

Returns the entire header as a list of lines.

* header.toString()

Returns the entire header as a string.
