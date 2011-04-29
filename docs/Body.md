Body Object
===========

The Body object gives you access to the textual body parts of an email.

API
---

* body.bodytext

A String containing the body text. Note that HTML parts will have tags in-tact.

* body.header

The header of this MIME part. See the `Header Object` for details of the API.

* body.children

Any child MIME parts. For example a multipart/alternative mail will have a
main body part with just the MIME preamble in (which is usually either empty,
or reads something like "This is a multipart MIME message"), and two
children, one text/plain and one text/html.
