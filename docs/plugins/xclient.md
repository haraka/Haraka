xclient
=======

Implements the [XCLIENT](http://www.postfix.org/XCLIENT_README.html) protocol.

## configuration

* xclient.hosts

    A list of IP addresses, one per line that should be allowed to use the 
    XCLIENT protocol.  Localhost (127.0.0.1 or ::1) is allowed implicitly.
