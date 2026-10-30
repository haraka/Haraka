const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const { once } = require('node:events')
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
        plugins: 'process_title\nkill_on_disconnect\nfaults\n',
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
    // workers loading their plugins while these files exist fail (fail_start, fail_init) or take a second
    // (slow_start). Tests create them once their workers listen: init_child hooks may still be running then, so
    // fail_init is read at load time too. With kill_old, worker 1 dies as worker 3 gets ready, and the master only
    // handles it after the restart has resumed. HELO crash makes a worker exit
    fs.writeFileSync(
        path.join(dir, 'plugins', 'faults.js'),
        `const cluster = require('node:cluster')
const fs = require('node:fs')
const flag = (name) => fs.existsSync(require('node:path').join(process.env.HARAKA, name))
const block = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
let fail_init = false
exports.register = () => {
    if (flag('fail_start')) throw new Error('fail_start')
    fail_init = flag('fail_init')
    if (flag('slow_start')) block(1000)
    if (!cluster.isMaster) return
    cluster.on('message', (worker, msg) => {
        if (worker.id !== 3 || msg?.event !== 'worker.ready' || !flag('kill_old')) return
        process.kill(cluster.workers[1].process.pid, 'SIGKILL')
        block(100)
    })
}
exports.hook_init_child = (next) => (fail_init ? next(DENY) : next())
exports.hook_helo = (next, connection, helo) => (helo === 'crash' ? process.exit(1) : next())
`,
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

// the worker that gets this connection exits
async function crash_worker(port) {
    const socket = net.connect(port, '127.0.0.1')
    // on Windows, the worker's exit resets the connection
    socket.on('error', () => {})
    const closed = new Promise((resolve) => socket.once('close', resolve))
    await once(socket, 'data')
    socket.write('HELO crash\r\n')
    await closed
}

describe('graceful restart', () => {
    let haraka

    afterEach(async () => {
        if (!haraka.exited) {
            const exited = new Promise((resolve) => haraka.proc.once('exit', resolve))
            // SIGTERM would kill Haraka before Node writes its NODE_V8_COVERAGE data
            haraka.proc.kill('SIGINT')
            // a stuck restart makes it ignore SIGINT
            const timer = setTimeout(() => haraka.proc.kill('SIGKILL'), 10000)
            await exited
            clearTimeout(timer)
        }
        fs.rmSync(haraka.dir, { recursive: true, force: true })
    })

    it("doesn't respawn the workers it kills", { timeout: 30000 }, async () => {
        haraka = await start_haraka('nodes=2\n')
        await haraka.wait_for(/(worker \d listening on [\s\S]*){2}/)

        // the second restart kills workers that a restart forked
        await internalcmd(haraka.port, 'gracefulRestart')
        await haraka.wait_for(/Reload complete, workers: \["3","4"\]/)
        await internalcmd(haraka.port, 'gracefulRestart')

        const [, workers] = await haraka.wait_for(/Reload complete[\s\S]*Reload complete, workers: (\[.*\])/)
        assert.deepEqual(JSON.parse(workers), ['5', '6'])
    })

    it('keeps respawning crashed workers after a restart', { timeout: 30000 }, async () => {
        haraka = await start_haraka('nodes=1\n')
        await haraka.wait_for(/worker 1 listening on/)
        await internalcmd(haraka.port, 'gracefulRestart')
        await haraka.wait_for(/Reload complete, workers: \["2"\]/)

        // worker 3 is the respawn of worker 2, forked by the restart
        for (const respawn of [3, 4]) {
            await crash_worker(haraka.port)
            await haraka.wait_for(new RegExp(`worker ${respawn} listening on`))
        }
    })

    it('survives a worker dying before its turn', { timeout: 30000 }, async () => {
        haraka = await start_haraka('nodes=2\n')
        const [, pid] = await haraka.wait_for(/worker started worker=2 pid=(\d+)/)
        await haraka.wait_for(/(worker \d listening on [\s\S]*){2}/)
        fs.writeFileSync(path.join(haraka.dir, 'slow_start'), '')

        await internalcmd(haraka.port, 'gracefulRestart')
        // the replacement of worker 1 is starting
        await haraka.wait_for(/worker started worker=3 /)
        process.kill(Number(pid), 'SIGKILL')
        fs.rmSync(path.join(haraka.dir, 'slow_start'))

        const [, workers] = await haraka.wait_for(/Reload complete, workers: (\[.*\])/)
        assert.equal(JSON.parse(workers).length, 2)
    })

    it('survives a worker dying as its replacement gets ready', { timeout: 30000 }, async () => {
        haraka = await start_haraka('nodes=2\n')
        await haraka.wait_for(/(worker \d listening on [\s\S]*){2}/)
        fs.writeFileSync(path.join(haraka.dir, 'kill_old'), '')

        await internalcmd(haraka.port, 'gracefulRestart')
        // worker 3 took the place of worker 1
        const [, workers] = await haraka.wait_for(/Reload complete, workers: (\[.*\])/)
        assert.deepEqual(JSON.parse(workers), ['3', '4'])
    })

    // before or after binding its listeners
    for (const fault of ['fail_start', 'fail_init']) {
        it(`keeps the workers whose replacements fail to start (${fault})`, { timeout: 30000 }, async () => {
            haraka = await start_haraka('nodes=2\n')
            await haraka.wait_for(/(worker \d listening on [\s\S]*){2}/)
            fs.writeFileSync(path.join(haraka.dir, fault), '')

            for (const restart of [1, 2]) {
                await internalcmd(haraka.port, 'gracefulRestart')
                const [, workers] = await haraka.wait_for(
                    new RegExp(`(?:[\\s\\S]*?Reload aborted){${restart}}, workers: (\\[.*\\])`),
                )
                assert.deepEqual(JSON.parse(workers), ['1', '2'])
            }

            // the failed replacements, workers 3 and 4, weren't respawned
            fs.rmSync(path.join(haraka.dir, fault))
            await internalcmd(haraka.port, 'gracefulRestart')
            const [, workers] = await haraka.wait_for(/Reload complete, workers: (\[.*\])/)
            assert.deepEqual(JSON.parse(workers), ['5', '6'])
        })
    }

    it('keeps accepting connections while a single worker is replaced', { timeout: 30000 }, async () => {
        haraka = await start_haraka('nodes=1\n')
        await haraka.wait_for(/worker 1 listening on/)
        fs.writeFileSync(path.join(haraka.dir, 'slow_start'), '')

        let restarted = false
        let refused = 0
        const probing = (async () => {
            while (!restarted) {
                await new Promise((resolve) => {
                    const socket = net.connect(haraka.port, '127.0.0.1')
                    socket.once('connect', () => resolve(socket.destroy()))
                    socket.once('error', () => resolve(refused++))
                })
                await sleep(20)
            }
        })()
        await internalcmd(haraka.port, 'gracefulRestart')
        await haraka.wait_for(/Reload complete/)
        restarted = true
        await probing
        assert.equal(refused, 0)
    })
})
