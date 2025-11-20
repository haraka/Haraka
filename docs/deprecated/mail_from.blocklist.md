# mail_from.blocklist

## DEPRECATED

This plugin is deprecated. Use instead the mail_from.access plugin, which
does everything this one does and much more. (whitelists, blacklists, regex)

This plugin blocks MAIL_FROM addresses in a list.

NOTE: If all you need is to deny mail based on the exact address, this plugin
will work just fine. If you want to customize the deny message, add blocks
based on a regex, or add whitelists, please use the mail_from.access plugin.

## Configuration

- mail_from.blocklist

  Contains a list of email addresses to block.
