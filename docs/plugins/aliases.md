aliases
=======

This plugin allows one to configure aliases that may perform an action or
change the RCPT address in a number of ways.  All aliases are specified in
a JSON formatted configuration file, and must have at very least an action.
Any syntax error found in the JSON format config file will stop the server
from running.

IMPORTANT: this plugin must appear in `config/plugins` before other plugins
that run on hook_rcpt

WARNING: DO NOT USE THIS PLUGIN WITH queue/smtp\_proxy.

Configuration
-------------

* aliases

    JSON formatted configuration file that must contain, at very least, a key
    to match against RCPT address, and a value that is an associative array
    with an "action" : "<action>" key, value pair.  An example:

        { "test1" : { "action" : "drop" } } 

    In the above example the "test1" alias will drop any message that matches
    test1, or test1-* or test1+* (wildcard '-' or '+', see below).  Actions
    may in turn have 0 or more options listed with them like so:

        { "test3" : { "action" : "alias", "to" : "test3-works" } }

    In the above example the "test3" alias has an action of "alias", and
    a required "to" field.  If this "to" field were missing the alias would
    fail to run, and an error would be printed in the logs.
    
    Now aliases of 'user', '@host' and 'user@host' possible:
    
        { "demo" : { "action" : "drop" } }
        or
        { "@example.com" : { "action" : "drop" } } 
        or
        { "demo@example.com" : { "action" : "drop" } } 

    Aliases may also be exploded to multiple recipients:

        { "sales@example.com": { "action: "alias", "to": ["alice@example.com", "bob@example.com"] } }

    * wildcard notation

        In an effort to match some of the functionality of other alias parsers
        we've allowed wildcard matching of the alias against the right most
        string of a RCPT address.  The characters '-' and '+' are commonly used
        for subaddressing and this plugin has built-in support to alias the
        "user" part of the email address.

        That is, if our address were test2-testing@example.com (or
        test2+testing@example.com), the below alias would match:

            { "test2" : { "action" : "drop" } }

        The larger, and more specific alias, should always match first when
        using wildcard '-' notation.  So if the above RCPT were put up against
        this alias config, it would not drop, but rather map to another
        address:

            {
                "test2" : { "action" : "drop" },
                "test2-testing" : { "action" : "alias", "to" : "test@foo.com" }
            }

    * chaining and circuits

        In short, we do not allow chaining of aliases at this time.  As a
        side-effect, we enjoy protections against alias circuits.

    * optional one line formatting

        Any valid JSON will due, however, please consider keeping each alias
        on its own line so that others that wish to grep the aliases file
        have an easier time finding the full configuration for an alias.

    * nondeterministic duplicate matches

        This plugin was written with speed in mind.  That means every lookup
        hashes into the alias file for its match.  While the act of doing so
        is fast, it does mean that any duplicate alias entries will match
        nondeterministically.  That is, we cannot predict what will happen
        here:

            {
                "coinflip" : { "action" : "alias", "to" : "heads@coin.com" },
                "coinflip" : { "action" : "alias", "to" : "tails@coin.com" }
            }

        Truth be told, one result will likely always be chosen over the other,
        so this is not exactly a coinflip.  We simply cannot say what the
        language implementation will do here, it could change tomorrow.

* action (required)

    The following is a list of supported actions, and the options they require.

    * drop

        This action simply drops a message, while pretending everything was
        okay to the sender.  This acts much like an alias to /dev/null in
        other servers.

    * alias

        This action will map the alias key to the address specified in the
        "to" option.  A note about matching in addition to the note
        about wildcard '-' above.  When we match an alias, we store the
        hostname of the match for a shortcut substitution syntax later. 

        * to (required)

            This option is the full address, or local part at matched hostname
            that the RCPT address will be re-written to.  For an example of
            an alias to a full address consider the following: 

                { "test5" : { "action" : "alias", "to" : "test5@foo.com" } }

            This will map RCPT matches for "test5" to "test5-works@foo.com".
            This would map "test5@somedomain.com" to "test5-works@foo.com"
            every time.  Now compare this notation with its shortcut
            counterpart, best used when the "to" address is at the same
            domain as the match:

                { "test4" : { "action" : "alias", "to" : "test4" } }

            Clearly, this notation is more compact, but what does it do.  Well,
            mail to "test4-foo@anydomain.com" will map to "test4@anydomain.com".
            One can see the clear benefit of using this notation with lots of
            aliases on a single domain that map to other local parts at the
            same domain.

Example Configuration
---------------------
{
    "test1" : { "action" : "drop" },
    "test2" : { "action" : "drop" },
    "test3" : { "action" : "alias", "to" : "test3-works" },
    "test4" : { "action" : "alias", "to" : "test4" },
    "test5" : { "action" : "alias", "to" : "test5-works@success.com" },
    "test6" : { "action" : "alias", "to" : "test6-works@success.com" }
}
