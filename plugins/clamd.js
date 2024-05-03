// clamd

const net = require('node:net')

const utils = require('haraka-utils');
const net_utils = require('haraka-net-utils')

exports.load_excludes = function () {

    this.loginfo('Loading excludes file');
    const list = this.config.get('clamd.excludes','list', () => {
        this.load_excludes();
    });

    const new_skip_list_exclude = [];
    const new_skip_list = [];
    for (const element of list) {
        let re;
        switch (element[0]) {
            case '!':

                if (element[1] === '/') {
                    // Regexp exclude
                    try {
                        re = new RegExp(element.substr(2, element.length-2),'i');
                        new_skip_list_exclude.push(re);
                    }
                    catch (e) {
                        this.logerror(`${e.message} (entry: ${element})`);
                    }
                }
                else {
                    // Wildcard exclude
                    try {
                        re = new RegExp(
                            utils.wildcard_to_regexp(element.substr(1)),'i');
                        new_skip_list_exclude.push(re);
                    }
                    catch (e) {
                        this.logerror(`${e.message} (entry: ${element})`);
                    }
                }
                break;
            case '/':
                // Regexp skip
                try {
                    re = new RegExp(element.substr(1, element.length-2),'i');
                    new_skip_list.push(re);
                }
                catch (e) {
                    this.logerror(`${e.message} (entry: ${element})`);
                }
                break;
            default:
                // Wildcard skip
                try {
                    re = new RegExp(utils.wildcard_to_regexp(element),'i');
                    new_skip_list.push(re);
                }
                catch (e) {
                    this.logerror(`${e.message} (entry: ${element})`);
                }
        }
    }

    // Make the new lists visible
    this.skip_list_exclude = new_skip_list_exclude;
    this.skip_list = new_skip_list;
}

exports.load_clamd_ini = function () {

    this.cfg = this.config.get('clamd.ini', {
        booleans: [
            '-main.randomize_host_order',
            '-main.only_with_attachments',
            '+reject.virus',
            '+reject.error',

            // clamd options that are disabled by default. If admin enables
            // them for clamd, Haraka should reject by default.
            '+reject.Broken.Executable',
            '+reject.Structured',     // DLP options
            '+reject.Encrypted',
            '+reject.PUA',
            '+reject.OLE2',
            '+reject.Safebrowsing',
            '+reject.UNOFFICIAL',

            // clamd.conf options enabled by default, but prone to false
            // positives.
            '-reject.Phishing',

            '+check.authenticated',
            '+check.private_ip',
            '+check.local_ip'
        ],
    }, () => {
        this.load_clamd_ini();
    });

    const defaults = {
        clamd_socket: 'localhost:3310',
        timeout: 30,
        connect_timeout: 10,
        max_size: 26214400,
    };

    for (const key in defaults) {
        if (this.cfg.main[key] === undefined) {
            this.cfg.main[key] = defaults[key];
        }
    }

    const rejectPatterns = {
        'Broken.Executable': '^Broken\\.Executable\\.?',
        Encrypted:           '^Encrypted\\.',
        PUA:                 '^PUA\\.',
        Structured:          '^Heuristics\\.Structured\\.',
        OLE2:                '^Heuristics\\.OLE2\\.ContainsMacros',
        Safebrowsing:        '^Heuristics\\.Safebrowsing\\.',
        Phishing:            '^Heuristics\\.Phishing\\.',
        UNOFFICIAL:          '\\.UNOFFICIAL$',
    };

    const all_reject_opts = [];
    const enabled_reject_opts = [];
    Object.keys(rejectPatterns).forEach(opt => {
        all_reject_opts.push(rejectPatterns[opt]);
        if (!this.cfg.reject[opt]) return;
        enabled_reject_opts.push(rejectPatterns[opt]);
    });

    if (enabled_reject_opts.length) {
        this.allRE = new RegExp(all_reject_opts.join('|'));
        this.rejectRE = new RegExp(enabled_reject_opts.join('|'));
    }

    // resolve mismatch between docs (...attachment) and code (...attachments)
    if (this.cfg.main.only_with_attachment !== undefined) {
        this.cfg.main.only_with_attachments =
            !!this.cfg.main.only_with_attachment;
    }
}

exports.register = function () {
    this.load_excludes();
    this.load_clamd_ini();
}

exports.hook_data = function (next, connection) {

    if (!this.cfg.main.only_with_attachments) return next();

    if (!this.should_check(connection)) return next();

    const txn = connection.transaction;
    txn.parse_body = true;
    txn.attachment_hooks((ctype, filename, body) => {
        connection.logdebug(this, `found ctype=${ctype}, filename=${filename}`);
        txn.notes.clamd_found_attachment = true;
    });

    next();
}

exports.hook_data_post = function (next, connection) {
    const plugin = this;
    if (!plugin.should_check(connection)) return next();

    const txn = connection.transaction;
    const { cfg } = plugin;
    // Do we need to run?
    if (cfg.main.only_with_attachments && !txn.notes.clamd_found_attachment) {
        connection.logdebug(plugin, 'skipping: no attachments found');
        txn.results.add(plugin, {skip: 'no attachments'});
        return next();
    }

    // Limit message size
    if (txn.data_bytes > cfg.main.max_size) {
        txn.results.add(plugin, {skip: 'exceeds max size', emit: true});
        return next();
    }

    const hosts = cfg.main.clamd_socket.split(/[,; ]+/);

    if (cfg.main.randomize_host_order) {
        hosts.sort(() => 0.5 - Math.random());
    }

    function try_next_host () {
        let connected = false;
        if (!hosts.length) {
            if (txn) txn.results.add(plugin, {err: 'connecting' });
            if (!plugin.cfg.reject.error) return next();
            return next(DENYSOFT, 'Error connecting to virus scanner');
        }
        const host = hosts.shift();
        connection.logdebug(plugin, `trying host: ${host}`);
        const socket = new net.Socket()
        net_utils.add_line_processor(socket)

        socket.on('timeout', () => {
            socket.destroy();
            if (!connected) {
                connection.logerror(plugin, `Timeout connecting to ${host}`);
                return try_next_host();
            }
            if (txn) txn.results.add(plugin, {err: 'clamd timed out' });
            if (!plugin.cfg.reject.error) return next();
            return next(DENYSOFT, 'Virus scanner timed out');
        });

        socket.on('error', err => {
            socket.destroy();
            if (!connected) {
                connection.logerror(plugin,
                    `Connection to ${host} failed: ${err.message}`);
                return try_next_host();
            }

            // If an error occurred after connection and there are other hosts left to try,
            // then try those before returning DENYSOFT.
            if (hosts.length) {
                connection.logwarn(plugin, `error on host ${host}: ${err.message}`);
                return try_next_host();
            }
            if (txn) txn.results.add(plugin, {err: `error on host ${host}: ${err.message}` });
            if (!plugin.cfg.reject.error) return next();
            return next(DENYSOFT, 'Virus scanner error');
        });

        socket.on('connect', () => {
            connected = true;
            socket.setTimeout((cfg.main.timeout || 30) * 1000);
            const hp = socket.address();
            const addressInfo = hp === null ? '' : ` ${hp.address}:${hp.port}`;
            connection.logdebug(plugin, `connected to host${addressInfo}`);
            plugin.send_clamd_predata(socket, () => {
                txn.message_stream.pipe(socket, { clamd_style: true });
            })
        });

        let result = '';
        socket.on('line', line => {
            connection.logprotocol(plugin, `C:${line.split('').filter((x) => {
                return 31 < x.charCodeAt(0) && 127 > x.charCodeAt(0)
            }).join('')}` );
            result = line.replace(/\r?\n/, '');
        });

        socket.setTimeout((cfg.main.connect_timeout || 10) * 1000);

        socket.on('end', () => {
            if (!txn) return next();
            if (/^stream: OK/.test(result)) {                // OK
                txn.results.add(plugin, {pass: 'clean', emit: true});
                return next();
            }

            const m = /^stream: (\S+) FOUND/.exec(result);
            if (m) {
                let virus;                                   // Virus found
                if (m[1]) { virus = m[1]; }
                txn.results.add(plugin, {
                    fail: virus ? virus : 'virus',
                    emit: true
                });

                if (virus && plugin.rejectRE &&       // enabled
                    plugin.allRE.test(virus) &&       // has a reject option
                    !plugin.rejectRE.test(virus)) {   // reject=false set
                    txn.add_header('X-Haraka-Virus', virus);
                    return next();
                }
                if (!plugin.cfg.reject.virus) { return next(); }

                // Check skip list exclusions
                for (const element of plugin.skip_list_exclude) {
                    if (!element.test(virus)) continue;
                    return next(DENY,
                        `Message is infected with ${virus || 'UNKNOWN'}`);
                }

                // Check skip list
                for (const element of plugin.skip_list) {
                    if (!element.test(virus)) continue;
                    connection.logwarn(plugin, `${virus} matches exclusion`);
                    txn.add_header('X-Haraka-Virus', virus);
                    return next();
                }
                return next(DENY, `Message is infected with ${
                    virus || 'UNKNOWN'}`);
            }

            if (/size limit exceeded/.test(result)) {
                txn.results.add(plugin, {
                    err: 'INSTREAM size limit exceeded. Check ' +
                        'StreamMaxLength in clamd.conf',
                });
                // Continue as StreamMaxLength default is 25Mb
                return next();
            }

            // The current host returned an unknown result.  If other hosts are available,
            // then try those before returning a DENYSOFT.
            if (hosts.length) {
                connection.logwarn(plugin, `unknown result: '${result}' from host ${host}`);
                socket.destroy();
                return try_next_host();
            }
            txn.results.add(plugin, { err: `unknown result: '${result}' from host ${host}`});
            if (!plugin.cfg.reject.error) return next();
            return next(DENYSOFT, 'Error running virus scanner');
        });

        clamd_connect(socket, host);
    }

    // Start the process
    try_next_host();
}

exports.should_check = function (connection) {

    let result = true;  // default
    if (!connection?.transaction) return false

    if (this.cfg.check.authenticated == false && connection.notes.auth_user) {
        connection.transaction.results.add(this, { skip: 'authed'});
        result = false;
    }

    if (this.cfg.check.relay == false && connection.relaying) {
        connection.transaction.results.add(this, { skip: 'relay'});
        result = false;
    }

    if (this.cfg.check.local_ip == false && connection.remote.is_local) {
        connection.transaction.results.add(this, { skip: 'local_ip'});
        result = false;
    }

    if (this.cfg.check.private_ip == false && connection.remote.is_private) {
        if (this.cfg.check.local_ip == true && connection.remote.is_local) {
            // local IPs are included in private IPs
        }
        else {
            connection.transaction.results.add(this, { skip: 'private_ip'});
            result = false;
        }
    }

    return result;
}

exports.send_clamd_predata = (socket, cb) => {
    socket.write("zINSTREAM\0", () => {
        const received = 'Received: from Haraka clamd plugin\r\n';
        const buf = Buffer.alloc(received.length + 4);
        buf.writeUInt32BE(received.length, 0);
        buf.write(received, 4);
        socket.write(buf, cb)
    })
}

function clamd_connect (socket, host) {

    if (host.match(/^\//)) {
        socket.connect(host); // starts with /, unix socket
        return
    }

    const match = /^\[([^\] ]+)\](?::(\d+))?/.exec(host);
    if (match) {
        socket.connect((match[2] || 3310), match[1]); // IPv6 literal
        return
    }

    // IP:port, hostname:port or hostname
    const hostport = host.split(/:/);
    socket.connect((hostport[1] || 3310), hostport[0]);
}
