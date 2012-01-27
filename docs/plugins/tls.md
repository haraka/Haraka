tls
===

This plugin enables the use of TLS (via `STARTTLS`) in Haraka.

For this to work you need to create a certificate and key file in the
config directory. To do that use the following command:

    openssl req -x509 -nodes -days 2190 -newkey rsa:1024 \
            -keyout config/tls_key.pem -out config/tls_cert.pem

You will need to provide some details of location. And make the CN equal to
the contents of your `config/me` file.
