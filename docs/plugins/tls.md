# tls

This plugin enables the use of TLS (via `STARTTLS`) in Haraka.

For this plugin to work you must have SSL certificates installed correctly.

## Purchased Certificate

If you have a purchased certificate, install the key as config/tls\_key.pem and the
certificate (appended with any intermediate/chained/ca-cert files) as
config/tls\_cert.pem.

See also [Setting Up TLS](https://github.com/baudehlo/Haraka/wiki/Setting-up-TLS-with-CA-certificates)

## Self Issued (unsigned) Certificate

Create a certificate and key file in the config directory with the following
command:

    openssl req -x509 -nodes -days 2190 -newkey rsa:2048 \
            -keyout config/tls_key.pem -out config/tls_cert.pem

You will be prompted to provide details of your organization. Make sure the
Common Name is set to your servers Fully Qualified Domain Name, which should
be the same as the contents of your `config/me` file.
