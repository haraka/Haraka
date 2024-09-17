# tls

This plugin enables the use of TLS (via `STARTTLS`) in Haraka.

For this plugin to work you must have SSL certificates installed correctly.

Haraka has [SNI](https://en.wikipedia.org/wiki/Server_Name_Indication) support. When the remote MUA/MTA presents a servername during the TLS handshake and a TLS certificate with that Common Name matches, that certificate will be presented. If no match is found, the default certificate (see Certificate Files) is presented.

## Certificate Files

Defaults settings are shown and can be overridden in `config/tls.ini`.

```ini
key=tls_key.pem
cert=tls_cert.pem
dhparam=dhparams.pem
```

## Certificate Directory

If the directory `config/tls` exists, files within the directory are PEM encoded TLS files in one of two formats: bundles or Wild Wild West.

### Certificate bundles

Generate PEM bundles in The Usual Way[TM] by concatenating the key, certificate, and CA/chain certs in that order. Example:

```sh
cat example.com.key example.com.crt ca-int.crt > haraka/config/tls/example.com.pem
```

An example [acme.sh](https://acme.sh) deployment [script](https://github.com/msimerson/Mail-Toaster-6/blob/master/provision/letsencrypt.sh) installs [Let's Encrypt](https://letsencrypt.org) certificate bundles to the Haraka `config/tls`directory.

### Wild Wild West

PEM encoded TLS certificates and keys can be stored in files in `config/tls`. The certificate loader is recursive, so TLS files can be in subdirs like `config/tls/mx1.example.com`. The certificate names are parsed from the 1st cert in each file and indexed by the certs Common Name(s). Subject Alternate Names are supported. The file name containing the certificates does *not* matter. Additional certificates within each file are presumed to be CA chain (intermediate) certificates.

If the TLS key is stored in the same file as the matching certificate, then the name of the file does not matter. If the TLS key is alone in a file, the file MUST be named with the keys Common Name. The file extension does not matter, `.pem` and `.key` are common. If the key is used for multiple CNs, the key must be stored in a file name matching each CN. Examples of working TLS key/cert file pairs for the Common Name mx1.example.com:

1. certificate bundle (see above), key & cert in same file
    - config/tls/mx1.example.com.pem (recommended)
    - config/tls/any-unique-name.pem (CN is extracted from 1st cert)
2. files in TLS dir
    - config/tls/mx1.example.com.crt
    - config/tls/mx1.example.com.key
3. files in subdir
    - config/tls/example.com/mx1.cert
    - config/tls/example.com/mx1.example.com.key
4. wildcard bundle on Windows platform (* is not allowed in file names)
    - config/tls/_.example.com.pem

## Purchased Certificate

For purchased certificate, append any intermediate/chained/ca-cert files to the certificate in this order:

1. The CA signed SSL cert
2. Any intermediate certificates
3. The CA root certificate

See also [Setting Up TLS](https://github.com/haraka/Haraka/wiki/Setting-up-TLS-with-CA-certificates)

## Self Issued (unsigned) Certificate

Create a certificate and key file in the config directory with the following command:

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

```ini
key=example.com.key.pem
cert=example.com.crt-chain.pem
```

To use multiple pairs of key and cert chain files outside of the haraka
`config/` directory, configure instead:

```ini
key[]=/etc/ssl/private/example.com.rsa.key.pem
cert[]=/etc/ssl/private/example.com.rsa.crt-chain.pem
key[]=/etc/ssl/private/example.com.ecdsa.key.pem
cert[]=/etc/ssl/private/example.com.ecdsa.crt-chain.pem
```

### cert

Specifies the location(s) for the certificate chain file. For multiple certificate chains, use `cert[]=` assignment for each. Non-absolute paths are relative to the `config/` directory. See the description of the `key` parameter for specific use.

### no_tls_hosts

If needed, add this section to the `config/tls.ini` file and list any IP ranges that have broken TLS hosts. Ex:

```ini
[no_tls_hosts]
192.168.1.3
172.16.0.0/16
```

Note: `[no_tls_hosts]` section applies to inbound only. For outbound mail, this feature is implemented as an array like `force_tls_hosts`:

```ini
[outbound]
no_tls_hosts[]=192.168.1.3
no_tls_hosts[]=172.16.0.0/16
```

The [Node.js TLS](http://nodejs.org/api/tls.html) page has additional information about the following options.

### no_starttls_ports

An array of incoming ports on which Haraka will not advertise STARTTLS capability.

```ini
no_starttls_ports[]=2525
```

### force_tls_hosts

For known good TLS hosts, it's possible to force that the outbound mailer will only connect via secure sockets. This makes Haraka use *forced TLS* instead of *opportunistic TLS*. For forced TLS, the STARTTLS upgrade must succeed with a valid certificate (overriding `rejectUnauthorized`). The list is matched both against the host (MX record or `nexthop` in `relay_dest_domains.ini`), and the domain name of the email address.

Note: unlike `no_tls_hosts`, this feature is implemented as an array:

```ini
[outbound]
force_tls_hosts[]=172.17.123.1
force_tls_hosts[]=172.17.124.0/24
force_tls_hosts[]=mx.example.org
force_tls_hosts[]=example.com
```

### ciphers

A list of allowable ciphers to use. Example:

    ciphers=EECDH+AESGCM:EDH+aRSA+AESGCM:EECDH+AES256:EDH+aRSA+AES256:EECDH+AES128:EDH+aRSA+AES128:RSA+AES:RSA+3DES

See also: [Mozilla SSL configuration generator](https://ssl-config.mozilla.org/) and the [SSLlabs Test Page](https://www.ssllabs.com/ssltest/index.html)

### minVersion

Specifies minimum allowable TLS protocol version to use. Example:

     minVersion=TLSv1.1 

If unset, the default is node's tls.DEFAULT_MIN_VERSION constant.

(**Node.js 11.4+ required**, for older instances you can use *secureProtocol* settings)

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


### requireAuthorized

When `rejectUnauthorized=false`, require validated TLS certificates on just the specified ports.

```ini
requireAuthorized[]=465
;requireAuthorized[]=587
```


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

## `[redis]` section

This section is mainly used to enable so called _TLS NO-GO_ feature that essentially stops advertising/using TLS if there was a problem setting it up previously. We use `no_tls|ip.add.re.ss` key to store the flag in redis. There are a couple of settings that control the behavior:

`disable_for_failed_hosts = true` to enable the feature

`disable_expiry = 604800` to set for how long we disable TLS for failing host, in seconds

`disable_inbound_expiry = 3600` same as above, but applies to inbound (aka STARTTLS capability) only
