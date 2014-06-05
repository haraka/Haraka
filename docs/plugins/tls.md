# tls

This plugin enables the use of TLS (via `STARTTLS`) in Haraka.

For this plugin to work you must have SSL certificates installed correctly.

## Install Location

    config/tls_key.pem
    config/tls_cert.pem

## Purchased Certificate

If you have a purchased certificate, append any intermediate/chained/ca-cert
files to the certificate in this order:

1. The CA signed SSL cert
2. Any intermediate certificates
3. The CA root certificate

Example:

    cat mail.example.com.crt intermediary_cert.crt ca-cert.crt > config/tls_cert.pem

See also [Setting Up TLS](https://github.com/baudehlo/Haraka/wiki/Setting-up-TLS-with-CA-certificates)

## Self Issued (unsigned) Certificate

Create a certificate and key file in the config directory with the following
command:

    openssl req -x509 -nodes -days 2190 -newkey rsa:2048 \
            -keyout config/tls_key.pem -out config/tls_cert.pem

You will be prompted to provide details of your organization. Make sure the
Common Name is set to your servers Fully Qualified Domain Name, which should
be the same as the contents of your `config/me` file.

## Configuration

### `no_tls_hosts`

If needed, add this section to the tls.ini file and list any IPs that have
broken TLS. Ex:

    [no_tls_hosts]
    192.168.1.3=true


The following settings can be specified in config/tls.ini. The
[Node.js TLS](http://nodejs.org/api/tls.html) page has additional information
about these options.

### requestCert

Whether a server should request a certificate from a connecting client. Only
applies to server connections.

    `requestCert=[true|false]`  (default: true)

### rejectUnauthorized

Emits an 'error' event when certificate verification fails.

    `rejectUnauthorized=[true|false]`  (default: true)

### secureProtocol

Restrict SSL to specified protocol(s).

this setting would require SSLv3:

    `secureProtocol=SSLv3_method`

### ciphers

A list of allowable ciphers to use.

    `ciphers=...`

See also: [Strong SSL Ciphers](http://cipherli.st) and the [SSLlabs Test Page](https://www.ssllabs.com/ssltest/index.html)

