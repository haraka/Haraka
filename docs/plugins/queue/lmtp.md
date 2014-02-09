queue/lmtp
========

This plugin delivers mails to inbound domains via LMTP/SMTP.

Configuration
-------------

* `config/lmtp.ini`
    This config file provides server address and port of LMTP server to deliver for different inbound domains.
    Syntax is equal to those used for the queue/smtp_forward plugin.
    
    Example:

    ; defaults
    host=localhost
    port=24

    [example.com]
    ; Goes elsewhere
    host=10.1.1.1
    port=2400
    
    
