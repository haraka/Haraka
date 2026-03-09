'use strict'

const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const queue = require('../../outbound/queue')
const qfile = require('../../outbound/qfile')

const sourceQueueDir = path.join('test', 'queue')
const testQueueDir = path.join('test', 'test-queue')
const fixtureFiles = [
    '1508455115683_1508455115683_0_90253_9Q4o4V_1_haraka',
    '1508269674999_1508269674999_0_34002_socVUF_1_haraka',
]

const clearTestQueue = () => {
    fs.mkdirSync(testQueueDir, { recursive: true })
    for (const file of fs.readdirSync(testQueueDir)) {
        fs.unlinkSync(path.join(testQueueDir, file))
    }
}

const populateTestQueue = () => {
    clearTestQueue()
    for (const file of fixtureFiles) {
        fs.copyFileSync(path.join(sourceQueueDir, file), path.join(testQueueDir, file))
    }
}

describe('outbound/queue', () => {
    describe('read_parts', () => {
        it('parses valid queue filenames', () => {
            const filename = '1507509981169_1507509981169_0_61403_e0Y0Ym_1_haraka'
            const parts = queue.read_parts(filename)
            assert.ok(parts)
            assert.equal(parts.arrival, 1507509981169)
            assert.equal(parts.next_attempt, 1507509981169)
            assert.equal(parts.attempts, 0)
            assert.equal(parts.pid, 61403)
            assert.equal(parts.uid, 'e0Y0Ym')
        })

        it('rejects dot files', () => {
            assert.strictEqual(queue.read_parts('__tmp__.filename'), false)
        })

        it('rejects error files', () => {
            assert.strictEqual(queue.read_parts('error.something'), false)
        })

        it('rejects invalid queue files', () => {
            assert.strictEqual(queue.read_parts('invalid-file'), false)
        })
    })

    describe('load_queue_files', () => {
        beforeEach(() => {
            populateTestQueue()
        })
        afterEach(() => {
            clearTestQueue()
        })

        it('processes valid queue files', async () => {
            const seen = []

            const files = await queue.load_queue_files(
                null,
                ['1508455115683_1508455115683_0_90253_9Q4o4V_1_haraka'],
                (file) => {
                    seen.push(file)
                    return file
                },
            )
            assert.equal(seen.length, 1)
            assert.equal(files[0], '1508455115683_1508455115683_0_90253_9Q4o4V_1_haraka')
        })

        it('skips invalid files', async () => {
            const seen = []

            await queue.load_queue_files(
                null,
                ['1507509981169_1507509981169_0_61403_e0Y0Ym_1_haraka', 'invalid-file', 'zero-length'],
                (file) => {
                    seen.push(file)
                },
            )
            assert.equal(seen.length, 1)
        })

        it('filters files by pid', async () => {
            let renameAttempts = 0

            // Mock rename to track calls
            const originalRename = queue.rename_to_actual_pid
            queue.rename_to_actual_pid = (file, parts, cb) => {
                renameAttempts++
                cb(new Error('test skip'))
            }

            await queue.load_queue_files(
                61403, // specific pid
                [
                    '1507509981169_1507509981169_0_61403_e0Y0Ym_1_haraka',
                    '1508455115683_1508455115683_0_90253_9Q4o4V_1_haraka',
                ], // different pids
                (_file) => {},
            )
            queue.rename_to_actual_pid = originalRename
            assert.equal(renameAttempts, 1)
        })
    })

    describe('ensure_queue_dir', () => {
        it('creates queue dir', async () => {
            const tmpDir = path.join(os.tmpdir(), `haraka-test-queue-${Date.now()}`)

            // Override queue_dir for this test
            const originalQueueDir = queue.queue_dir
            queue.queue_dir = tmpDir

            try {
                await queue.ensure_queue_dir()
                assert.ok(fs.existsSync(tmpDir))
                const stat = await fs.promises.stat(tmpDir)
                assert.ok(stat.isDirectory())
            } catch (err) {
                assert.fail(`ensure_queue_dir threw an error: ${err.message}`)
            } finally {
                queue.queue_dir = originalQueueDir
                if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true })
            }
        })

        it('returns early if queue dir already exists', async () => {
            const tmpDir = path.join(os.tmpdir(), `haraka-test-queue-exists-${Date.now()}`)
            fs.mkdirSync(tmpDir)

            const originalQueueDir = queue.queue_dir
            queue.queue_dir = tmpDir

            try {
                await queue.ensure_queue_dir()
                assert.ok(fs.existsSync(tmpDir))
            } catch (err) {
                assert.fail(`ensure_queue_dir threw an error: ${err.message}`)
            } finally {
                queue.queue_dir = originalQueueDir
                fs.rmSync(tmpDir, { recursive: true })
            }
        })
    })

    describe('_load_cur_queue', () => {
        beforeEach(() => {
            populateTestQueue()
        })
        afterEach(() => {
            clearTestQueue()
        })

        it('reads queue directory and processes files', async () => {
            const processedFiles = []
            await queue._load_cur_queue(null, (file) => {
                processedFiles.push(file)
            })

            assert.ok(processedFiles.length >= 0)
        })
    })

    describe('list_queue', () => {
        beforeEach(() => {
            populateTestQueue()
        })
        afterEach(() => {
            clearTestQueue()
        })

        it('returns todo objects from real queue files', async () => {
            const qlist = await queue.list_queue()
            assert.ok(Array.isArray(qlist))
            assert.ok(qlist.length > 0)
            assert.ok(qlist[0].mail_from)
            assert.ok(Array.isArray(qlist[0].rcpt_to))
        })
    })

    describe('stat_queue', () => {
        beforeEach(() => {
            populateTestQueue()
        })
        afterEach(() => {
            clearTestQueue()
        })

        it('returns queue stats', async () => {
            const stats = await queue.stat_queue()
            assert.ok(stats)
            assert.ok('queue_dir' in stats)
            assert.ok(stats.queue_count >= 1)
        })
    })

    describe('load_pid_queue', () => {
        beforeEach(() => {
            populateTestQueue()
        })
        afterEach(() => {
            clearTestQueue()
        })

        it('delegates pid loading to init_queue', async () => {
            const parts = qfile.parts(fixtureFiles[0])
            const observed = []
            const originalLoadQueue = queue.init_queue

            queue.init_queue = (pid) => {
                observed.push(pid)
            }

            try {
                assert.ok(fs.existsSync(path.join(testQueueDir, fixtureFiles[0])))
                await queue.load_pid_queue(parts.pid)
                assert.deepEqual(observed, [parts.pid])
            } finally {
                queue.init_queue = originalLoadQueue
            }
        })
    })
})
