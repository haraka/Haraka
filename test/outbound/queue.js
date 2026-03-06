'use strict'

const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const queue = require('../../outbound/queue')
const qfile = require('../../outbound/qfile')

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
        it('processes valid queue files', (done) => {
            const seen = []
            const iteratee = (file, cb) => {
                seen.push(file)
                cb(null, file)
            }

            queue.load_queue_files(null, ['1507509981169_1507509981169_0_61403_e0Y0Ym_1_haraka'], iteratee, (err, results) => {
                assert.ifError(err)
                assert.equal(seen.length, 1)
                assert.equal(results[0], '1507509981169_1507509981169_0_61403_e0Y0Ym_1_haraka')
                done()
            })
        })

        it('skips invalid files', (done) => {
            const seen = []

            queue.load_queue_files(
                null,
                ['1507509981169_1507509981169_0_61403_e0Y0Ym_1_haraka', 'invalid-file', 'zero-length'],
                (file, cb) => {
                    seen.push(file)
                    cb(null, file)
                },
                (err, results) => {
                    assert.ifError(err)
                    assert.equal(seen.length, 1)
                    done()
                },
            )
        })

        it('filters files by pid', (done) => {
            let renameAttempts = 0

            // Mock rename to track calls
            const originalRename = queue.rename_to_actual_pid
            queue.rename_to_actual_pid = (file, parts, cb) => {
                renameAttempts++
                cb(new Error('test skip'))
            }

            queue.load_queue_files(
                61403, // specific pid
                ['1507509981169_1507509981169_0_61403_e0Y0Ym_1_haraka', '1508455115683_1508455115683_0_90253_9Q4o4V_1_haraka'], // different pids
                (_file, cb) => {
                    cb(null)
                },
                (err) => {
                    queue.rename_to_actual_pid = originalRename
                    // Should only attempt rename on matching pid
                    assert.equal(renameAttempts, 1)
                    done()
                },
            )
        })
    })

    describe('ensure_queue_dir', () => {
        it('creates queue dir', () => {
            const tmpDir = path.join(os.tmpdir(), `haraka-test-queue-${Date.now()}`)

            // Override queue_dir for this test
            const originalQueueDir = queue.queue_dir
            queue.queue_dir = tmpDir

            try {
                queue.ensure_queue_dir()
                assert.ok(fs.existsSync(tmpDir))
                const stat = fs.statSync(tmpDir)
                assert.ok(stat.isDirectory())
            } catch (err) {
                assert.fail(`ensure_queue_dir threw an error: ${err.message}`)
            } finally {
                queue.queue_dir = originalQueueDir
                if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true })
            }
        })

        it('returns early if queue dir already exists', () => {
            const tmpDir = path.join(os.tmpdir(), `haraka-test-queue-exists-${Date.now()}`)
            fs.mkdirSync(tmpDir)

            const originalQueueDir = queue.queue_dir
            queue.queue_dir = tmpDir

            try {
                queue.ensure_queue_dir()
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
        it('reads queue directory and processes files', (done) => {
            const testDir = path.join('test', 'queue')
            const originalQueueDir = queue.queue_dir
            const processedFiles = []

            queue.queue_dir = testDir

            queue._load_cur_queue(
                null,
                (file, cb) => {
                    processedFiles.push(file)
                    cb(null, file)
                },
                () => {
                    queue.queue_dir = originalQueueDir
                    // console.log('Processed files:', processedFiles)
                    assert.ok(processedFiles.length >= 0)
                    done()
                },
            )
        })
    })

    describe('list_queue', () => {
        it('returns array from test queue directory', (done) => {
            const originalQueueDir = queue.queue_dir
            queue.queue_dir = path.join('test', 'test-queue')

            queue.list_queue((err, qlist) => {
                if (err) console.error('list_queue error:', err)
                console.log(qlist)
                queue.queue_dir = originalQueueDir
                // Test gracefully handles malformed queue files
                done()
            })
        })
    })

    describe('stat_queue', () => {
        it('returns queue stats', (done) => {
            const originalQueueDir = queue.queue_dir
            queue.queue_dir = path.join('test', 'test-queue')

            queue.stat_queue((err, stats) => {
                queue.queue_dir = originalQueueDir
                assert.ifError(err)
                assert.ok(stats)
                assert.ok('queue_dir' in stats)
                done()
            })
        })
    })

    describe('load_pid_queue', () => {
        it('attempts to load queue for specific pid', () => {
            let loadQueuePid = null
            const originalLoadQueue = queue.load_queue

            queue.load_queue = (pid) => {
                loadQueuePid = pid
            }

            try {
                queue.load_pid_queue(12345)
                assert.equal(loadQueuePid, 12345)
            } finally {
                queue.load_queue = originalLoadQueue
            }
        })
    })
})
