# tls

This plugin enables the use of TLS (via `STARTTLS`) in Haraka.

For this plugin to work you must have SSL certificates installed correctly.

## Certificate Files

Defaults are shown and can be overridden in `config/tls.ini`.

    key=tls_key.pem
    cert=tls_cert.pem
    dhparam=dhparams.pem


## Certificate Directory

If the directory `config/tls` exists, each file within the directory is expected to be a PEM encoded TLS bundle. Generate the PEM bundles in The Usual Way[TM] by concatenating the key, certificate, and CA/chain certs in that order. Example:

    cat example.com.key example.com.crt ca.crt > config/tls/example.com.pem

An example [acme.sh](https://acme.sh) deployment [script](https://github.com/msimerson/Mail-Toaster-6/blob/master/provision-letsencrypt.sh) demonstrates how to install [Let's Encrypt](https://letsencrypt.org) certificates to the Haraka `config/tls`directory.

Haraka has [SNI](https://en.wikipedia.org/wiki/Server_Name_Indication) support. When the remote MUA/MTA presents a servername during the TLS handshake and a TLS certificate with that Common Name matches, that certificate will be presented. If no match is found, the default certificate (see Certificate Files above) is presented.

## Purchased Certificate

If you have a purchased certificate, append any intermediate/chained/ca-cert
files to the certificate in this order:

1. The CA signed SSL cert
2. Any intermediate certificates
3. The CA root certificate

See also [Setting Up TLS](https://github.com/haraka/Haraka/wiki/Setting-up-TLS-with-CA-certificates)

## Self Issued (unsigned) Certificate

Create a certificate and key file in the config directory with the following
command:

    openssl req -x509 -nodes -days 2190 -newkey rsa:2048 \
            -keyout config/tls_key.pem -out config/tls_cert.pem

You will be prompted to provide details of your organization. Make sure the
Common Name is set to your servers Fully Qualified Domain Name, which should
be the same as the contents of your `config/me` file.

## Configuration

The following settings can be specified in `config/tls.ini`.

### key

Specifies an alternative location for the key file. For multiple keys, use `key[]=` assignment for each. Non-absolute paths are relative to the `config/` directory.

To configure a single key and a cert chain, located in the `config/`
directory, use the following in `tls.ini`:

    key=example.com.key.pem
    cert=example.com.crt-chain.pem

To use multiple pairs of key and cert chain files outside of the haraka
`config/` directory, configure instead:

    key[]=/etc/ssl/private/example.com.rsa.key.pem
    cert[]=/etc/ssl/private/example.com.rsa.crt-chain.pem
    key[]=/etc/ssl/private/example.com.ecdsa.key.pem
    cert[]=/etc/ssl/private/example.com.ecdsa.crt-chain.pem

### cert

Specifies the location(s) for the certificate chain file. For multiple certificate chains, use `cert[]=` assignment for each. Non-absolute paths are relative to the `config/` directory. See the description of the `key` parameter for specific use.

### no_tls_hosts

If needed, add this section to the `config/tls.ini` file and list any IP ranges that have broken TLS hosts. Ex:

    [no_tls_hosts]
    192.168.1.3
    172.16.0.0/16


The [Node.js TLS](http://nodejs.org/api/tls.html) page has additional information about the following options.

### ciphers

A list of allowable ciphers to use. Example:

    ciphers=EECDH+AESGCM:EDH+aRSA+AESGCM:EECDH+AES256:EDH+aRSA+AES256:EECDH+AES128:EDH+aRSA+AES128:RSA+AES:RSA+3DES

See also: [Strong SSL Ciphers](http://cipherli.st) and the [SSLlabs Test Page](https://www.ssllabs.com/ssltest/index.html)

### honorCipherOrder

If specified, the list of configured ciphers is treated as the cipher priority from highest to lowest. The first matching cipher will be used, instead of letting the client choose. The default is `true`.

### ecdhCurve

Specifies the elliptic curve used for ECDH or ECDHE ciphers.
Only one curve can be specified. The default is `prime256v1` (NIST P-256).

### dhparam

Specifies the file containing the diffie-hellman parameters to use for DH or DHE key exchange. If this param or file is missing, it will be generated automatically. Default: `dhparams.pem`.

### requestCert

Whether Haraka should request a certificate from a connecting client.

    requestCert=[true|false]  (default: true)


### rejectUnauthorized

Reject connections from clients without a CA validated TLS certificate.

    rejectUnauthorized=[true|false]  (default: false)


### secureProtocol

Specifies the OpenSSL API function used for handling the TLS session. Choose
one of the methods described at the
[OpenSSL API page](https://www.openssl.org/docs/manmaster/ssl/ssl.html).
The default is `SSLv23_method`.


### requestOCSP

Specifies that OCSP Stapling should be enabled, according to RFC 6066.
Stapling of OCSP messages allows the client to receive these along the
TLS session setup instead of delaying the session setup by requiring a
separate http connection to the OCSP server.

    requestOCSP=[true|false]  (default: false)

OCSP responses from the OCSP server are cached in memory for as long as
they are valid, and get refreshed after that time. A server restart
requires the OCSP responses to be fetched again upon the first client
connection.


## Inbound Specific Configuration

By default the above options are shared with outbound mail (either
using `smtp_forward`, `smtp_proxy` or plain outbound mail heading to
an external destination). To make these options specific to inbound
mail, put them under an `[inbound]` parameter group. Outbound options
can go under an `[outbound]` parameter group, and plugins that use
SMTP tls for queueing such as `smtp_proxy` and `smtp_forward` can
use that plugin name for plugin specific options.
