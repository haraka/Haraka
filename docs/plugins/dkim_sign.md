# `dkim_sign`

This plugin implements the DKIM Core specification found at dkimcore.org

DKIM Core is a simplified subset of DKIM which is easier to understand
and deploy, yet provides all the same delivery advantages as DKIM.

This plugin can only *sign* outbound messages.  It does not validate
DKIM signatures.


## Getting Started

Generate DKIM selector and keys:

    % cd /path/to/haraka/config/dkim
    ./dkim_key_gen.sh example.org

Peek into the `dkim_key_gen.sh` shell script to see the commands used to
create and format the DKIM public key. Within the config/dkim/example.org
 directory will be 4 files:

    % ls config/dkim/example.org/
    dns private public selector

The`private` and `public` files contain the DKIM keys, the selector is
in the `selector` file and the `dns` file contains a formatted record of
the public key, as well as suggestions for DKIM, SPF, and DMARC policy
records. The records in `dns` are ready to be copy/pasted into the DNS
zone for example.org.

The DKIM DNS record will look like this:

    may2013._domainkey TXT "v=DKIM1;p=[public key stripped of whitespace];"

And the values in the address have the following meaning:

    hash: h=[ sha1 | sha256 ]
    test; t=[ s | s:y ]
    granularity: g=[ ]
    notes: n=[ ]
    services: s=[email]
    keytypes: [ rsa ]


## Key size

The default key size created by `dkim_key_gen.sh` is 2048. As of mid-2014, there are some DNS providers that do not support key sizes that long.

# What to sign

The DKIM signing key for messages from example.org *should* be signed with
 a DKIM key for example.org. Failing to do so will result in messages not
having an *aligned* DKIM signature. For DMARC enabled domains, this will
likely result in deliverability problems.

For correct alignment, Haraka signs each message with that domains DKIM key.
For an alternative, see the legacy Single Domain Configuration below.


# Configuration

This plugin uses the configuration `dkim_sign.ini` in INI format.
All configuration should appear within the 'main' block and is
checked for updates on every run.

- disabled = [ 1 | true | yes ]             (OPTIONAL)

    Set this to disable DKIM signing

- headers\_to\_sign = list, of; headers       (REQUIRED)

    Set this to the list of headers that should be signed
    separated by either a comma, colon or semi-colon.
    This is to prevent any tampering of the specified headers.
    The 'From' header is required to be present by the RFC and
    will be added if it is missing.


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

