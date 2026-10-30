const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')
const { describe, it, afterEach } = require('node:test')
const { setTimeout: sleep } = require('node:timers/promises')

const free_port = () =>
    new Promise((resolve, reject) => {
        const server = net.createServer().listen(0, '127.0.0.1', () => {
            const { port } = server.address()
            server.close(() => resolve(port))
        })
        server.on('error', reject)
    })

async function start_haraka(smtp_ini) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'haraka-'))
    fs.mkdirSync(path.join(dir, 'config'))
    fs.mkdirSync(path.join(dir, 'plugins'))
    const port = await free_port()
    const config = {
        'smtp.ini': `listen=127.0.0.1:${port}\n${smtp_ini}`,
        // the logger holds every line back until a plugin is loaded
        plugins: 'process_title\nkill_on_disconnect\n',
        'log.ini': '[main]\nlevel=notice\n',
        me: 'localhost\n',
    }
    for (const [name, content] of Object.entries(config)) {
        fs.writeFileSync(path.join(dir, 'config', name), content)
    }
    // connections need its [message] section
    fs.copyFileSync(path.join(__dirname, '..', 'config', 'connection.ini'), path.join(dir, 'config', 'connection.ini'))
    // _graceful kills a worker still running after exit_timeout: this plugin kills it as soon as it's disconnected
    fs.writeFileSync(
        path.join(dir, 'plugins', 'kill_on_disconnect.js'),
        "exports.register = () => process.on('disconnect', () => process.kill(process.pid, 'SIGTERM'))\n",
    )

    const proc = spawn(process.execPath, [path.join(__dirname, '..', 'haraka.js')], {
        env: { ...process.env, HARAKA: dir },
    })
    // exitCode stays null when a signal kills the process
    const haraka = { dir, port, proc, exited: false }
    proc.once('exit', () => (haraka.exited = true))
    let output = ''
    proc.stdout.on('data', (data) => (output += data))
    proc.stderr.on('data', (data) => (output += data))

    haraka.wait_for = async (re) => {
        let match
        while (!(match = re.exec(output))) {
            if (haraka.exited) throw new Error(`haraka exited:\n${output}`)
            await sleep(50)
        }
        return match
    }
    return haraka
}

// sends an internal command as `haraka --graceful` does
async function internalcmd(port, cmd) {
    const socket = net.connect(port, '127.0.0.1').setEncoding('utf8')
    let replies = ''
    socket.on('data', (data) => (replies += data))
    // socket.closed covers connection errors
    socket.on('error', () => {})
    const reply = async (code) => {
        while (!new RegExp(`^${code} `, 'm').test(replies)) {
            if (socket.closed || /^5\d\d /m.test(replies)) throw new Error(`INTERNALCMD ${cmd}: ${replies}`)
            await sleep(20)
        }
    }
    await reply(220)
    socket.write(`INTERNALCMD ${cmd}\r\n`)
    await reply(250)
    socket.end('QUIT\r\n')
}

describe('graceful restart', { timeout: 30000 }, () => {
    let haraka

    afterEach(async () => {
        if (!haraka.exited) {
            const exited = new Promise((resolve) => haraka.proc.once('exit', resolve))
            // SIGTERM would kill Haraka before Node writes its NODE_V8_COVERAGE data
            haraka.proc.kill('SIGINT')
            await exited
        }
        fs.rmSync(haraka.dir, { recursive: true, force: true })
    })

    it("doesn't respawn the workers it kills", async () => {
        haraka = await start_haraka('nodes=2\n')
        await haraka.wait_for(/(worker \d listening on [\s\S]*){2}/)

        // workers 3 and 4 are forked by the restart, which gives them the exit listener that respawned killed workers
        await internalcmd(haraka.port, 'gracefulRestart')
        await haraka.wait_for(/Reload complete, workers: \["3","4"\]/)
        await internalcmd(haraka.port, 'gracefulRestart')

        const [, workers] = await haraka.wait_for(/Reload complete[\s\S]*Reload complete, workers: (\[.*\])/)
        assert.deepEqual(JSON.parse(workers), ['5', '6'])
    })
})
