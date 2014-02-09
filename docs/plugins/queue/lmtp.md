queue/lmtp
========

This plugin delivers mails to inbound domains via LMTP/SMTP.

Configuration
-------------

* `config/delivery_domains`
    This config file provides server address and port of LMTP/SMTP server to deliver for specific inbound domains
    
    Example:
    
    [example.com]
    priority=0
    exchange=127.0.0.1
    port=24
    isLMTP=1    #isLMTP=0 assumes SMTP
    
