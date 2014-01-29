avg
===

This plug-in implements Anti-Virus scanning with AVG using the TCPD daemon which is available for Linux/FreeBSD and 
is [free for personal or commercial use](http://www.avg.com/gb-en/faq.pnuid-faq_v3_linux).   
It can be downloaded from [here](http://free.avg.com/gb-en/download.prd-alf). 

Any message that AVG considers to be infected will be rejected.  Any errors encountered will cause the plugin to return a temporary failure.

Configuration
-------------

This plugin uses avg.ini for configuration.  The available options are listed below with their default values.

- port

    Default: 54322
    
    TCP port to communicate with the AVG TCPD on.
 
 
- tmpdir

    Default: /tmp
    
    AVG TCPD requires that the message be written to disk and scanned.  This setting configures where any temporary files
    are written to.   Once the scan is complete the temporary files are automatically removed.
    
- connect\_timeout

    Default: 10
    
    Maximum number of seconds to wait for the socket to become connected before failing.   Any connections taking longer than
    this will cause a temporary failure to be sent to the connected client.
    
- session\_timeout

    Maximum number of seconds to wait for a reply to a command before failing.  Any timeout will cause a temporary failure to
    be sent to the connected client.
    

