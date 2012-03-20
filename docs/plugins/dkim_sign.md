dkim_sign
=========

This plugin implements the DKIM Core specification found at dkimcore.org

DKIM Core is a simplified subset of DKIM which is easier to understand
and deploy, yet provides all the same delivery advantages as DKIM.

This plugin can only *sign* outbound messages.  It does not validate
DKIM signatures.

Getting Started
---------------

First, generate an RSA key pair in your Haraka config directory by 
running the following commands:

    cd /path/to/haraka/config
    openssl genrsa -out dkim.private.key 1024
    openssl rsa -in dkim.private.key -pubout > dkim.public.key

A selector is used to identify the keys used to attach a token to a 
piece of email. It does appear in the header of the email sent, but 
isn’t otherwise visible or meaningful to the final recipient. Any time 
you generate a new key pair you need to choose a new selector.

A selector is a string of no more than 63 lower-case alphanumeric 
characters (a-z or 0-9) followed by a period “.”, followed by another 
string of no more than 63 lower-case alphanumeric characters.

Next you have to publish the public key as a DNS TXT record for your
domain by concatenating the selector, the literal string ._domainkey.
and your domain name.  e.g. mail._domainkey.example.com

The content of the TXT record can be created by concatenating the 
literal string “v=DKIM1;t=s;n=core;p=” and the public key excluding
the ---BEGIN and ---END lines and wrapping the key into a single line.

See the key wizard at http://dkimtools.org/tools

Configuation
------------

This plugin uses the configuration dkim_sign.ini in INI format.
All configuration should appear within the 'main' block and is
checked for updates on every run.

- disabled = [ 1 | true | yes ]             (OPTIONAL)
    
    Set this to disable DKIM signing

- selector = name                           (REQUIRED)

    Set this to the selector name published in DNS under the
    _domainkey sub-domain of the domain referenced below.

- domain = name                             (REQUIRED)

    Set this to the domain name that will be used to sign the
    message.  The DNS TXT entry for:
        
        <selector>._domainkey.<domain>

    MUST be present, otherwise remote systems will not be able
    to validate the signature applied to the message.

- headers_to_sign = list, of; headers      (REQUIRED)

    Set this to the list of headers that should be signed
    separated by either a comma, colon or semi-colon.
    This is to prevent any tampering of the specified headers.
    The 'From' header is required to be present by the RFC and
    will be added if it is missing.
