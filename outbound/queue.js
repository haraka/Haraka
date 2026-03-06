'use strict'

const child_process = require('node:child_process')
const fs = require('node:fs/promises')
const path = require('node:path')

const { Address } = require('address-rfc2821')
const config = require('haraka-config')

const logger = require('../logger')
const TimerQueue = require('./timer_queue')
const HMailItem = require('./hmail')
const obc = require('./config')
const _qfile = require('./qfile')
const obtls = require('./tls')

class Queue {
    constructor(worker) {
        this.worker = worker
        this.tasks = []
        this.running = 0
    }

    push(task) {
        this.tasks.push(task)
        this._process()
    }

    length() {
        return this.tasks.length + this.running
    }

    async _process() {
        while (this.running < obc.cfg.concurrency_max && this.tasks.length > 0) {
            this.running++
            const task = this.tasks.shift()

            try {
                // Support both callback and async worker functions
                const result = this.worker(task, (err) => {
                    // Callback handler for backward compatibility
                })
                if (result instanceof Promise) {
                    await result
                }
            } finally {
                this.running--
                setImmediate(() => this._process())
            }
        }
    }
}

exports.name = 'outbound/queue'

let queue_dir
if (config.get('queue_dir')) {
    queue_dir = path.resolve(config.get('queue_dir'))
} else if (process.env.HARAKA) {
    queue_dir = path.resolve(process.env.HARAKA, 'queue')
} else {
    queue_dir = path.resolve('test', 'test-queue')
}

exports.queue_dir = queue_dir

const load_queue = new Queue((file, cb) => {
    const hmail = new HMailItem(file, path.join(queue_dir, file))
    exports._add_hmail(hmail)
    hmail.once('ready', cb)
})

let in_progress = 0
const delivery_queue = (exports.delivery_queue = new Queue((hmail, cb) => {
    in_progress++
    hmail.next_cb = () => {
        in_progress--
        cb()
    }
    if (obtls.cfg) return hmail.send()
    obtls.init(() => {
        hmail.send()
    })
}))

const temp_fail_queue = (exports.temp_fail_queue = new TimerQueue())

let queue_count = 0

exports.get_stats = () => `${in_progress}/${exports.delivery_queue.length()}/${exports.temp_fail_queue.length()}`

exports.list_queue = async () => {
    return exports._load_cur_queue(null, exports._list_file)
}

exports._stat_file = async (file) => {
    queue_count++
}

exports.stat_queue = async () => {
    await exports._load_cur_queue(null, exports._stat_file)
    return exports.stats()
}

exports.load_queue = async (pid) => {
    // Initialise and load queue
    // This function is called first when not running under cluster,
    await exports.ensure_queue_dir()
    await exports.delete_dot_files()

    await exports._load_cur_queue(pid, exports._add_file)
    logger.info(exports, `[pid: ${pid}] ${delivery_queue.length()} files in my delivery queue`)
    logger.info(exports, `[pid: ${pid}] ${load_queue.length()} files in my load queue`)
    logger.info(exports, `[pid: ${pid}] ${temp_fail_queue.length()} files in my temp fail queue`)
}

exports._load_cur_queue = async (pid, iteratee) => {
    logger.info(exports, 'Loading outbound queue from ', queue_dir)
    let files
    try {
        files = await fs.readdir(queue_dir)
    } catch (err) {
        logger.error(exports, `Failed to load queue directory (${queue_dir}): ${err}`)
        throw err
    }

    exports.cur_time = new Date() // set once so we're not calling it a lot

    return exports.load_queue_files(pid, files, iteratee)
}

exports.read_parts = (file) => {
    if (file.startsWith(_qfile.platformDOT)) {
        logger.warn(exports, `'Skipping' dot-file in queue folder: ${file}`)
        return false
    }

    if (file.startsWith('error.')) {
        logger.warn(exports, `'Skipping' error file in queue folder: ${file}`)
        return false
    }

    const parts = _qfile.parts(file)
    if (!parts) {
        logger.error(exports, `Unrecognized file in queue folder: ${file}`)
        return false
    }

    return parts
}

exports.rename_to_actual_pid = async (file, parts) => {
    // maintain some original details for the rename
    const new_filename = _qfile.name({
        arrival: parts.arrival,
        uid: parts.uid,
        next_attempt: parts.next_attempt,
        attempts: parts.attempts,
    })

    try {
        await fs.rename(path.join(queue_dir, file), path.join(queue_dir, new_filename))
        return new_filename
    } catch (err) {
        throw new Error(`Unable to rename queue file: ${file} to ${new_filename} : ${err}`)
    }
}

exports._add_file = async (file) => {
    const parts = _qfile.parts(file)

    if (parts.next_attempt <= exports.cur_time) {
        logger.debug(exports, `File ${file} needs processing now`)
        load_queue.push(file)
    } else {
        logger.debug(exports, `File ${file} needs processing later: ${parts.next_attempt - exports.cur_time}ms`)
        temp_fail_queue.add(file, parts.next_attempt - exports.cur_time, () => {
            load_queue.push(file)
        })
    }
}

exports.load_queue_files = async (pid, input_files, iteratee) => {
    const searchPid = parseInt(pid)

    let stat_renamed = 0
    let stat_loaded = 0

    if (searchPid) {
        logger.info(exports, `Grabbing queue files for pid: ${pid}`)
    } else {
        logger.info(exports, 'Loading the queue...')
    }

    const results = await Promise.all(
        input_files.map(async (file) => {
            const parts = exports.read_parts(file)
            if (!parts) return null

            if (!searchPid) {
                stat_loaded++
                return file
            }

            if (parts.pid !== searchPid) return null

            try {
                const renamed_file = await exports.rename_to_actual_pid(file, parts)
                stat_renamed++
                stat_loaded++
                return renamed_file
            } catch (error) {
                logger.error(exports, `${error.message}`)
                return null
            }
        }),
    )

    if (searchPid) logger.info(exports, `[pid: ${pid}] ${stat_renamed} files old PID queue fixed up`)
    logger.debug(exports, `[pid: ${pid}] ${stat_loaded} files loaded`)

    const filtered = results.filter((i) => i)
    return await Promise.all(
        filtered.map(async (item) => {
            await iteratee(item)
        }),
    )
}

exports.stats = () => {
    return {
        queue_dir,
        queue_count,
    }
}

// position `position`. Loops to handle partial reads.
// Read exactly `length` bytes into `buffer` starting at `offset`, from file
async function readFull(handle, buffer, offset, length, position) {
    let totalRead = 0
    while (totalRead < length) {
        const { bytesRead } = await handle.read(buffer, offset + totalRead, length - totalRead, position + totalRead)
        if (bytesRead === 0) {
            throw new Error(`Unexpected end of file: read ${totalRead} of ${length} bytes`)
        }
        totalRead += bytesRead
    }
}

exports._list_file = async (file) => {
    let handle
    try {
        const filePath = path.join(queue_dir, file)

        handle = await fs.open(filePath, 'r')

        // Read first 4 bytes to get the todo length
        const buf = Buffer.alloc(4)
        await readFull(handle, buf, 0, 4, 0)
        const todo_len = (buf[0] << 24) + (buf[1] << 16) + (buf[2] << 8) + buf[3]

        const todoBuf = Buffer.alloc(todo_len)
        await readFull(handle, todoBuf, 0, todo_len, 4)

        const todo = todoBuf.toString('utf8')
        const todo_struct = JSON.parse(todo)
        todo_struct.rcpt_to = todo_struct.rcpt_to.map((a) => new Address(a))
        todo_struct.mail_from = new Address(todo_struct.mail_from)
        todo_struct.file = file
        todo_struct.full_path = filePath
        const parts = _qfile.parts(file)
        todo_struct.pid = parts?.pid || null
        return todo_struct
    } catch (err) {
        console.error(`Error reading queue file: ${file}:`, err)
        return null
    } finally {
        if (handle) await handle.close().catch((err) => console.error(`Failed to close queue file handle for ${file}:`, err))
    }
}

exports.flush_queue = async (domain, pid) => {
    if (domain) {
        try {
            const qlist = await exports.list_queue()
            for (const todo of qlist) {
                if (todo.domain.toLowerCase() !== domain.toLowerCase()) continue
                if (pid && todo.pid !== pid) continue
                // console.log("requeue: ", todo);
                delivery_queue.push(new HMailItem(todo.file, todo.full_path))
            }
        } catch (err) {
            logger.error(exports, `Failed to load queue: ${err.message}`)
        }
    } else {
        temp_fail_queue.drain()
    }
}

exports.load_pid_queue = async (pid) => {
    logger.info(exports, `Loading queue for pid: ${pid}`)
    await exports.load_queue(pid)
}

exports.ensure_queue_dir = async () => {
    // this code is only run at start-up.
    try {
        await fs.access(queue_dir)
        return // directory already exists
    } catch (ignore) {
        // directory doesn't exist, try to create it
    }

    logger.debug(exports, `Creating queue directory ${queue_dir}`)
    try {
        await fs.mkdir(queue_dir, { mode: 493 }) // 493 == 0755
        const cfg = config.get('smtp.ini')
        let uid
        let gid
        if (cfg.user) uid = Number.parseInt(child_process.execSync(`id -u ${cfg.user}`).toString().trim(), 10)
        if (cfg.group) gid = Number.parseInt(child_process.execSync(`id -g ${cfg.group}`).toString().trim(), 10)
        if (uid && gid) {
            await fs.chown(queue_dir, uid, gid)
        } else if (uid) {
            await fs.chown(queue_dir, uid, -1)
        }
    } catch (err) {
        if (err.code !== 'EEXIST') {
            logger.error(exports, `Error creating queue directory: ${err}`)
            throw err
        }
    }
}

exports.delete_dot_files = async () => {
    try {
        const files = await fs.readdir(queue_dir)
        for (const file of files) {
            if (file.startsWith(_qfile.platformDOT)) {
                logger.warn(exports, `Removing left over dot-file: ${file}`)
                await fs.unlink(path.join(queue_dir, file))
            }
        }
    } catch (err) {
        logger.error(exports, `Error deleting dot files: ${err}`)
    }
}

exports._add_hmail = (hmail) => {
    if (hmail.next_process <= exports.cur_time) {
        delivery_queue.push(hmail)
    } else {
        temp_fail_queue.add(hmail.filename, hmail.next_process - exports.cur_time, () => {
            delivery_queue.push(hmail)
        })
    }
}

exports.scan_queue_pids = async () => {
    // Under cluster, this is called first by the master
    await exports.ensure_queue_dir()
    await exports.delete_dot_files()

    let files
    try {
        files = await fs.readdir(queue_dir)
    } catch (err) {
        logger.error(exports, `Failed to load queue directory (${queue_dir}): ${err}`)
        throw err
    }

    const pids = {}

    for (const file of files) {
        const parts = exports.read_parts(file)
        if (parts) pids[parts.pid] = true
    }

    return Object.keys(pids)
}
