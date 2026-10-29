const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')
const { describe, it, afterEach } = require('node:test')

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
    const config = {
        'smtp.ini': `listen=127.0.0.1:${await free_port()}\n${smtp_ini}`,
        // the logger holds every line back until a plugin is loaded
        plugins: 'process_title\n',
        'log.ini': '[main]\nlevel=notice\n',
        me: 'localhost\n',
    }
    for (const [name, content] of Object.entries(config)) {
        fs.writeFileSync(path.join(dir, 'config', name), content)
    }

    const proc = spawn(process.execPath, [path.join(__dirname, '..', 'haraka.js')], {
        env: { ...process.env, HARAKA: dir },
    })
    // exitCode stays null when a signal kills the process
    const haraka = { dir, proc, exited: false }
    proc.once('exit', () => (haraka.exited = true))
    let output = ''
    proc.stdout.on('data', (data) => (output += data))
    proc.stderr.on('data', (data) => (output += data))

    haraka.wait_for = async (re) => {
        while (!re.test(output)) {
            if (haraka.exited) throw new Error(`haraka exited:\n${output}`)
            await new Promise((resolve) => setTimeout(resolve, 50))
        }
    }
    return haraka
}

describe('SIGUSR2', { skip: process.platform === 'win32' && 'no SIGUSR2 on Windows', timeout: 30000 }, () => {
    let haraka

    afterEach(async () => {
        if (!haraka.exited) {
            const exited = new Promise((resolve) => haraka.proc.once('exit', resolve))
            haraka.proc.kill('SIGTERM')
            await exited
        }
        fs.rmSync(haraka.dir, { recursive: true, force: true })
    })

    it('replaces the workers, the master keeps running', async () => {
        haraka = await start_haraka('nodes=2\n')
        await haraka.wait_for(/(worker \d listening on [\s\S]*){2}/)

        haraka.proc.kill('SIGUSR2')

        await haraka.wait_for(/Reload complete, workers: \["3","4"\]/)
        assert.equal(haraka.exited, false)
    })

    it('is ignored without cluster', async () => {
        haraka = await start_haraka('nodes=0\n')
        await haraka.wait_for(/Listening on /)

        haraka.proc.kill('SIGUSR2')

        await haraka.wait_for(/SIGUSR2 received, ignored/)
        assert.equal(haraka.exited, false)
    })
})
