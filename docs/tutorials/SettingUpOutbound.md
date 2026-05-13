# Configuring Haraka For Outbound Email

It is straightforward to run Haraka as an outbound (submission) mail server. Before turning on the server itself, get a few external things in order:

- **DNS PTR record** — make sure it matches the A/AAAA record of the host you are sending from. Receivers that disagree on `HELO`/PTR will treat your mail with suspicion.
- **SPF, DKIM, and DMARC** — publish records for any domain you send from. Most receivers downgrade or reject mail without them. Haraka signs outbound with [haraka-plugin-dkim](https://github.com/haraka/haraka-plugin-dkim).
- **Reverse DNS at the IP owner** — if your hosting provider controls the PTR, set the value through their console.

How to provision DNS varies by provider; the records are network-specific so no one-size-fits-all command applies.

## Background

Haraka treats outbound mail as "relaying". When any plugin sets `connection.relaying = true`, the message is queued for outbound delivery once `DATA` ends. The outbound engine then tries each MX in sequence; on permanent failure a DSN is generated and sent to the `MAIL FROM` address. If the DSN itself bounces, Haraka logs the "double bounce" and drops it.

## Setup

Modern submission uses **implicit TLS on port 465** (RFC 8314); port 587 with `STARTTLS` is also still common. Plain port 25 is for server-to-server traffic and should not be used for submission.

Create a new Haraka instance:

```sh
haraka -i haraka-outbound
cd haraka-outbound
```

In `config/smtp.ini`, set the listener:

```ini
listen=[::0]:465,[::0]:587
smtps_port=465
```

Anything in `smtps_port` runs implicit TLS; the other ports advertise `STARTTLS`.

Enable just the TLS and auth plugins. AUTH is only advertised after TLS is established (except for connections from localhost):

```sh
cat > config/plugins <<'EOF'
tls
auth/flat_file
EOF
```

Add a user to `config/auth_flat_file.ini`. See [`docs/plugins/auth/flat_file.md`](../plugins/auth/flat_file.md) for the format.

Start Haraka:

```sh
haraka -c .
```

In another shell, test with [swaks](https://www.jetmore.org/john/code/swaks/) — substitute your real test address and the credentials you configured:

```sh
swaks --to youremail@yourdomain.com --from test@example.com \
    --server localhost --port 587 --tls \
    --auth-user testuser --auth-password testpassword
```

For port 465 (implicit TLS), use `--tls-on-connect` instead of `--tls`.

Watch the swaks output for errors and confirm the message arrives. That's all the basic configuration you need; once you're satisfied, turn on DKIM signing for the domains you send from.
