data.uribl
==========

This plugin extracts URLs and feeds them to URL based DNS blocklists such
as [SURBL][1] and [URIBL][2].

URLs are reduced to their second level of domain (e.g. `www.example.com` is
reduced to `example.com`, apart from those domains listed in
`data.uribl.two_level_tlds`, which are reduced to their third level.

Configuration
-------------

* data.uribl.zones

  A list of DNS zones to query.

* data.uribl.two_level_tlds

  A list of top level domains to extend to two levels of stripping rather
  than one. You may wish to add sites like wordpress.com and blogger.com
  to this list.

[1]: http://www.surbl.org/
[2]: http://www.uribl.com/