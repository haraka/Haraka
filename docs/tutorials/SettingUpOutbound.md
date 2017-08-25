Configuring Haraka For Outbound Email
=====================================

It is trivially easy to configure Haraka as an outbound email server. But
first there are external things you may want to sort out:

* Get your DNS PTR record working - make sure it matches the A record of the
  host you are sending from.
* Consider implementing an SPF record. I don't personally do this, but some
  people seem to think it helps.

There's lots of information elsewhere on the internet about getting these
things working, and they are specific to your network and your DNS hosting.

First Some Background
---------------------

Sending outbound mail through Haraka is called "relaying", and that is the
term the internals use. The process is simple - if a plugin in Haraka tells
the internals that this mail is to be relayed, then it gets queued in the
"queue" directory for delivery. Then it will go through several delivery
attempts until it is either successful or fails hard for some reason. A
hard failure will result in a bounce email being sent to the "MAIL FROM"
address used when connecting to Haraka. If that address also bounces then
it is considered a "double bounce" and Haraka will log an error and drop it
on the floor.

The Setup
---------

Outbound mail servers should run on port 587 and enforce authentication. This
is slightly different from the "old" model where there would simply be a
check based on the connecting IP address to see if it was valid to relay.
Note however that Haraka doesn't stop you doing it this way - we just don't
provide a plugin to do that by default - you will have to write one. The
reason is purely based on security and personal preference.

Let's create a new Haraka instance:

    haraka -i haraka-outbound
    cd haraka-outbound

Now edit config/smtp.ini - change the port to 587.

Next we setup our plugins - all we need is the tls and auth plugin. AUTH capability is only advertised after TLS/SSL negotiation (except for connections from the local host):

    echo "tls
    auth/flat_file" > config/plugins

Now edit the flat file password file, and put in an appropriate username
and password:

    vi config/auth_flat_file.ini

See the documentation in docs/plugins/auth/flat\_file.md for information about
what can go in that file.

Now you can start Haraka. That's all the configuration you need.

    haraka -c .

Now in another window you can run swaks to test this - be sure to substitute
an email address you can monitor in place of youremail@yourdomain.com, and the
username and password you added for the --auth-user and --auth-password params:

    swaks --to youremail@yourdomain.com --from test@example.com --server localhost \
      --port 587 --auth-user testuser --auth-password testpassword

Watch the output of swaks and ensure no errors have occurred. Then watch
the recipient email address (easiest to make this your webmail account) and
see that the email arrived.

You are done!
