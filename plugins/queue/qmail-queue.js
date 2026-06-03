// Queue to qmail-queue

const childproc = require('node:child_process')
const fs = require('node:fs')

exports.register = function () {
    this.queue_exec = this.config.get('qmail-queue.path') || '/var/qmail/bin/qmail-queue'
    if (!fs.existsSync(this.queue_exec)) {
        throw new Error(`Cannot find qmail-queue binary (${this.queue_exec})`)
    }

    this.load_qmail_queue_ini()

    if (this.cfg.main.enable_outbound) {
        this.register_hook('queue_outbound', 'hook_queue')
    }
}

exports.load_qmail_queue_ini = function () {
    this.cfg = this.config.get(
        'qmail-queue.ini',
        {
            booleans: ['+main.enable_outbound'],
        },
        () => {
            this.load_qmail_queue_ini()
        },
    )
}

// qmail-queue envelope: F<sender>\0 (T<rcpt>\0)* \0
// Built dynamically, sized to exactly the bytes needed.
//   doesn't emit zero padding after the terminating NUL.
//   encodes non-ASCII (SMTPUTF8) addresses correctly
exports.build_envelope = function (transaction) {
    const NUL = Buffer.from([0])
    const parts = [Buffer.from('F'), Buffer.from(transaction.mail_from.address), NUL]
    for (const rcpt of transaction.rcpt_to) {
        parts.push(Buffer.from('T'), Buffer.from(rcpt.address), NUL)
    }
    parts.push(NUL)
    return Buffer.concat(parts)
}

exports.hook_queue = function (next, connection) {
    const plugin = this

    const txn = connection?.transaction
    if (!txn) return next()

    const q_wants = txn.notes.get('queue.wants')
    if (q_wants && q_wants !== 'qmail-queue') return next()

    const qmail_queue = childproc.spawn(
        this.queue_exec, // process name
        [], // arguments
        { stdio: ['pipe', 'pipe', process.stderr] },
    )

    qmail_queue.on('exit', function finished(code) {
        if (code !== 0) {
            connection.logerror(plugin, `Unable to queue message to qmail-queue: ${code}`)
            next()
        } else {
            next(OK, 'Queued!')
        }
    })

    connection.transaction.message_stream.pipe(qmail_queue.stdin, {
        line_endings: '\n',
    })

    qmail_queue.stdin.on('close', () => {
        if (!connection?.transaction) {
            plugin.logerror('Transaction went away while delivering mail to qmail-queue')
            try {
                qmail_queue.stdout.end()
            } catch (err) {
                if (err.code !== 'ENOTCONN') {
                    // Ignore ENOTCONN and re throw anything else
                    throw err
                }
            }

            connection.results.add(plugin, { err: 'dead sender' })
            return
        }
        plugin.loginfo('Message Stream sent to qmail. Now sending envelope')
        const buf = plugin.build_envelope(connection.transaction)
        qmail_queue.stdout.on('error', () => {}) // stdout throws an error on close
        qmail_queue.stdout.end(buf)
    })
}
