# dkim_sign

This plugin implements the [DKIM Core specification](dkimcore.org).

This plugin only *signs* outbound messages. It does not validate DKIM signatures.


## Getting Started

Generate a DKIM selector and keys for your domain:

```sh
cd /path/to/haraka/config/dkim
./dkim_key_gen.sh example.org
```

Within the config/dkim/${domain} directory will be 4 files:

```sh
ls config/dkim/example.org/
dns private public selector
```

The selector file contains the DNS label where the DKIM public key is published. The `private` and `public` files contain the DKIM keys.

The `dns` file contains a formatted record of the public key suitable for copy/pasting into your domains zone file. It also has suggestions for DKIM, SPF, and DMARC policy records.

The DKIM DNS record will look like this:

    may2013._domainkey TXT "v=DKIM1;p=[public key stripped of whitespace];"

The values in the address have the following meaning:

    hash: h=[ sha1 | sha256 ]
    test; t=[ s | s:y ]
    granularity: g=[ ]
    notes: n=[ ]
    services: s=[email]
    keytypes: [ rsa ]


## Key size

The default key size created by `dkim_key_gen.sh` is 2048. That is considered secure as of mid-2014 but after 2020, you should be using 4096.

# What to sign

The DKIM signing key for messages from example.org *should* be signed with
 a DKIM key for example.org. Failing to do so will result in messages not
having an *aligned* DKIM signature. For DMARC enabled domains, this will
likely result in deliverability problems.

For correct alignment, Haraka signs each message with that domains DKIM key.
For an alternative, see the legacy Single Domain Configuration below.


# Configuration

This plugin is configured in `dkim_sign.ini`.

- disabled = [ 1 | true | yes ]             (OPTIONAL)

    Set this to disable DKIM signing

- headers\_to\_sign = list, of; headers       (REQUIRED)

    Set this to the list of headers that should be signed, separated by commas, colons or semi-colons. Signing prevents tampering with the specified headers.
    The 'From' header is required by the RFC and will be added if missing.


## Single Domain Configuration

To sign all messages with a single DKIM key, you must set the selector and domain in dkim_sign.ini. You must also save your DKIM private key in the file `dkim.private.key` in the Haraka config directory.

- selector = name

    Set this to the selector name published in DNS under the
    \_domainkey sub-domain of the domain referenced below.

- domain = name

    Set this to the domain name that will be used to sign messages
    which don't match a per-domain DKIM key.  The DNS TXT entry for:

        <selector>._domainkey.<domain>

Test that your DKIM key is published properly with a DNS request like this:

```sh
drill TXT $SELECTOR._domainkey.$DOMAIN
dig TXT $SELECTOR._domainkey.$DOMAIN +short
```

### Example DNS query

```sh
export SELECTOR=mar2013
export DOMAIN=simerson.net
$ dig TXT $SELECTOR._domainkey.$DOMAIN +short
"v=DKIM1;p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAoyUzGOTSOmakY8BcxXgi0mN/nFegLBPs7aaGQUtjHfa8yUrt9T2j6GSXgdjLuG3R43WjePQv3RHzc+bwwOkdw0XDOXiztn5mhrlaflbVr5PMSTrv64/cpFQKLtgQx8Vgqp7Dh3jw13rLomRTqJFgMrMHdhIibZEa69gtuAfDqoeXo6QDSGk5JuBAeRHEH27FriHulg5ob" "4F4lmh7fMFVsDGkQEF6jaIVYqvRjDyyQed3R3aTJX3fpb3QrtRqvfn/LAf+3kzW58AjsERpsNCSTD2RquxbnyoR/1wdGKb8cUlD/EXvqtvpVnOzHeSeMEqex3kQI8HOGsEehWZlKd+GqwIDAQAB"
```
