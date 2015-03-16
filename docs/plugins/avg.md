# avg - Anti-Virus scanner

This plug-in implements Anti-Virus scanning with AVG using the TCPD daemon which is available for Linux/FreeBSD and is [free for personal or commercial use](http://www.avg.com/gb-en/faq.pnuid-faq_v3_linux).
It can be downloaded from [here](http://free.avg.com/gb-en/download.prd-alf).

Any message that AVG considers to be infected will be rejected.  Any errors encountered will cause the plugin to return a temporary failure.

## Configuration

The following options can be set in avg.ini:

* port (default: 54322)

    TCP port to communicate with the AVG TCPD on.

* tmpdir (default: /tmp)

    AVG TCPD requires that the message be written to disk and scanned.  This setting configures where any temporary files are written to. After scanning, the temporary files are automatically removed.

* connect\_timeout (default: 10)

    Maximum seconds to wait for the socket to connect. Connections taking longer will cause a temporary failure to be sent to the remote MTA.

* session\_timeout

    Maximum number of seconds to wait for a reply to a command before failing.  A timeout will cause a temporary failure to be sent to the remote MTA.
