# dkim_sign

This plugin implements the [DKIM Core specification](dkimcore.org).

This plugin only *signs* outbound messages. It does not validate
DKIM signatures.


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

This plugin uses the configuration `dkim_sign.ini` in INI format.
All configuration should appear within the 'main' block.

- disabled = [ 1 | true | yes ]             (OPTIONAL)

    Set this to disable DKIM signing

- headers\_to\_sign = list, of; headers       (REQUIRED)

    Set this to the list of headers that should be signed
    separated by either a comma, colon or semi-colon.
    This is to prevent any tampering of the specified headers.
    The 'From' header is required to be present by the RFC and
    will be added if missing.


## Single Domain Configuration

To sign all messages with a single DKIM key, these two config settings
are required.

- selector = name

    Set this to the selector name published in DNS under the
    \_domainkey sub-domain of the domain referenced below.

- domain = name

    Set this to the domain name that will be used to sign messages
    which don't match a per-domain DKIM key.  The DNS TXT entry for:

        <selector>._domainkey.<domain>

- dkim.private.key = filename

    Create a file `dkim.private.key` in the config folder and paste
    your private key in it.