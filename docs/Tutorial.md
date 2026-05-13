# Writing Haraka Plugins

Part of the joy of using Haraka as your main mail server is having a strong plugin system: you control every aspect of how mail is processed, accepted, and delivered.

This tutorial walks through a small plugin that supports *disposable addresses*: an email like `user-20271231@example.com` is accepted up until 31 December 2027, after which delivery is rejected. Mail that is still within the validity window is rewritten back to `user@example.com` before it is forwarded on.

## What You'll Need

- Node.js (an active LTS release) and npm
- Haraka
- A text editor
- [swaks][swaks] for sending test mail

## Getting Started

Install Haraka and create a project:

```sh
sudo npm install -g Haraka
haraka -i /path/to/new_project
```

Use a directory that does not yet exist. Now scaffold a plugin:

```sh
haraka -c /path/to/new_project -p rcpt_to.disposable
```

`haraka -p` reports the files it created:

```
Plugin rcpt_to.disposable created
Now edit javascript in:    /path/to/new_project/plugins/rcpt_to.disposable.js
Add the plugin to config:  /path/to/new_project/config/plugins
And edit documentation in: /path/to/new_project/docs/plugins/rcpt_to.disposable.md
```

Edit `config/plugins` so the only enabled lines are:

```
rcpt_to.disposable
rcpt_to.in_host_list
queue/test
```

The ordering matters — the disposable plugin must run *before* `rcpt_to.in_host_list`, which accepts mail for domains listed in `config/host_list`. `queue/test` writes accepted mail to a `.eml` file in `os.tmpdir()` so you can confirm delivery.

Open `plugins/rcpt_to.disposable.js` and start with:

```js
exports.hook_rcpt = (next, connection, params) => {
    const rcpt = params[0]
    connection.loginfo(`got recipient: ${rcpt}`)
    next()
}
```

Verify it works. In one terminal:

```sh
echo LOGDEBUG > config/loglevel
echo myserver.com >> config/host_list
sudo haraka -c /path/to/new_project
```

In another:

```sh
swaks -h example.com -t booya@myserver.com -f sender@example.com -s localhost -p 25
```

You should see something like this in the Haraka log:

```
[INFO] [<uuid>] [rcpt_to.disposable] got recipient: <booya@myserver.com>
```

…and a `.eml` file in your system temp directory containing the message.

## Parsing Out the Date

Detect addresses of the form `user-YYYYMMDD` and parse the date:

```js
exports.hook_rcpt = (next, connection, params) => {
    const rcpt = params[0]
    connection.loginfo(`got recipient: ${rcpt}`)

    const match = /^(.*)-(\d{4})(\d{2})(\d{2})$/.exec(rcpt.user)
    if (!match) return next()

    // Date constructor uses zero-indexed months (Dec === 11)
    const expiry = new Date(match[2], match[3] - 1, match[4])
    connection.loginfo(`expires on: ${expiry.toISOString()}`)

    next()
}
```

Restart Haraka and send:

```sh
swaks -h example.com -t booya-20271231@myserver.com \
    -f sender@example.com -s localhost -p 25
```

Logs:

```
[INFO] [rcpt_to.disposable] got recipient: <booya-20271231@myserver.com>
[INFO] [rcpt_to.disposable] expires on: 2027-12-31T00:00:00.000Z
```

## Rejecting Expired Addresses

Compare the parsed date to today and reject if it has already passed:

```js
exports.hook_rcpt = (next, connection, params) => {
    const rcpt = params[0]

    const match = /^(.*)-(\d{4})(\d{2})(\d{2})$/.exec(rcpt.user)
    if (!match) return next()

    const expiry = new Date(match[2], match[3] - 1, match[4])
    if (expiry < new Date()) {
        return next(DENY, 'Expired email address')
    }

    next()
}
```

Send mail to an expired address:

```sh
swaks -h example.com -t booya-20200101@myserver.com \
    -f sender@example.com -s localhost -p 25
```

The remote end sees:

```
<** 550 Expired email address
```

## Rewriting Live Addresses

When the address is still valid, strip the date tag so the downstream mail store receives plain `user@domain`:

```js
exports.hook_rcpt = (next, connection, params) => {
    const rcpt = params[0]

    const match = /^(.*)-(\d{4})(\d{2})(\d{2})$/.exec(rcpt.user)
    if (!match) return next()

    const expiry = new Date(match[2], match[3] - 1, match[4])
    if (expiry < new Date()) {
        return next(DENY, 'Expired email address')
    }

    rcpt.user = match[1]
    connection.loginfo(`rewrote recipient to: ${rcpt}`)
    next()
}
```

Send to a live tagged address and watch the log:

```
[INFO] [rcpt_to.disposable] rewrote recipient to: <booya@myserver.com>
```

## Further Reading

The Haraka API offers much more — body and header access, ESMTP extension hooks, the outbound delivery hooks, structured results, attachments, and so on. Two good starting points:

- The [Plugins guide](Plugins.md) and the rest of the `docs/` directory.
- The [Plugin registry](https://github.com/haraka/Haraka/blob/master/PLUGINS.md) for an inventory of real-world plugins.
- The plugins shipped in the [`plugins/`](../plugins/) directory. Even the most elaborate are under 200 lines; many are under 20.

[swaks]: https://www.jetmore.org/john/code/swaks/
