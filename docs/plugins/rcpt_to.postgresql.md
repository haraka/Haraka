# rcpt_to.postgresql

Validates the rcpt_to addresses (recipient addresses) by connecting to a PostgreSQL database.

To enable this plugin add the following line to the `config/plugins` file.

`rcpt_to.postgresql`

## Config

The `rcpt_to.postgresql.json` file has the following structure (defaults shown). Also note that this file will need
to be created, if not present, in the `config` directory.

```javascript
{
  "user": "thihara",
  "database": "haraka",
  "password": "",
  "host": "127.0.0.1",
  "port": 5432,
  "max": 20,
  "idleTimeoutMillis": 30000,
  "sqlQuery": "SELECT EXISTS(SELECT 1 FROM valid_emails WHERE email_id=$1) AS \"exists\""
}
```

## Dependencies

This plugin depends on the following libraries.

* pg ^6.1.0
