# `rcpt_to.routes`

Recipient Routes does two things: recipient validation and MX routing.

## Recipient Validation

Recipients can be listed in the [routes] section of the config file
`config/rcpt_to.routes.ini` or in Redis. If Redis is available, it is checked
first. Then the config file is checked.

Entries can be email addresses or domains. If both are present, email
addresses are favored.

If no route is discovered, recipient processing continues, allowing other
recipient plugins to vouch for the recipient. If none does, the recipient is
rejected.

### Order of Recipient Search

1. Redis email
2. Redis domain
3. File email
4. File domain

## MX Routing

Each entry in `config/rcpt_to.routes.ini` or the Redis table must specify a
MX record. The MX record is the format required by _outbound.js_. Examples:

    * hostname
    * hostname:port
    * ipaddress
    * ipaddress:port
    * { priority: 0, exchange: hostname, port: 25 }

## Configuration

The following options can be specified in `config/rcpt_to.routes.ini`:

### Redis

The [redis] section has three optional settings (defaults shown):

    [redis]
    server_ip=127.0.0.1
    server_port=6379
    db=0

### Routes

The [routes] section can include routes for domains and email addresses:

    [routes]
    example.com=mail.example.com:225
    matt@example.com=some.where.com
    spam@example.com=honeybucket.where.com:26

# Performance

Routes from the config file are loaded into an object at server startup. If
the config file changes, the config file is automatically reloaded. Key
lookups in the object are extremely fast, about 450,000 qps on a Dell R600. I
haven't benchmarked Redis lookups but I'd expect them to be in the same
ballpark.
