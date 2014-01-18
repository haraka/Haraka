spamassassin
============

This plugin implements the spamd protocol and will send messages to
spamd for scoring.

Configuration
-------------

spamassassin.ini

- spamd_socket = \[host:port | /path/to/socket\]  *optional*

    Default: localhost:783

    Host or path to socket where spamd is running.

- spamd_user = \[user\]   *optional*

    Default: default

    Username to pass to spamd.  This is useful when you are running
    spamd with virtual users.

    You can also pass this value in dynamically by setting:

    `connection.transaction.notes.spamd_user`

- max_size = N  *optional*

    Default: 500000

    Maximum size of messages (in bytes) to send to spamd.
    Messages over this size will be skipped.

- reject_threshold = N   *optional*

    Default: none (do not reject any mail)

    SpamAssassin score at which the mail should be rejected.

- relay_reject_threshold = N  *optional*

    Default: none

    As above, except this threshold only applies to connections 
    that are relays (e.g. AUTH) where connection.relaying = true.
    This is used to set a *lower* thresold at which to reject mail
    from these hosts to prevent sending outbound spam.

    If this is not set, then the `reject_thresold` value is used.

- munge_subject_threshold = N  *optional*

    Default: none (do not munge the subject)

    Score at which the subject should be munged (prefixed).

- subject_prefix = \[prefix\]   *optional*

    Default: *** SPAM ***

    Prefix to use when munging the subject.

- old_headers_action = \[rename | drop | keep\]   *optional*

    Default: rename

    If old X-Spam-\* headers are in the email, what do we do with them? 

    `rename` them to X-Old-Spam-\*. 

    `drop` will delete them. 

    `keep` will keep them (new X-Spam-\* headers appear lower down in 
    the headers then).


Extras
======

A SpamAssassin plugin can be found in the `contrib` directory. 
The `Haraka.\[pm|cf\]` files should be placed in the SpamAssassin local 
site rules directory (/etc/mail/spamassassin on Linux), spamd should be 
restarted and the plugin will make spamd output the Haraka UUID as part 
of its log output to aid debugging when searching the mail logs.

