/*eslint no-shadow: ["error", { "allow": ["file", "depth", "code", "signal"] }]*/
// attachment

var fs = require('fs');
var spawn = require('child_process').spawn;
var path = require('path');
var crypto = require('crypto');
var utils = require('./utils');

var tmp;
var bsdtar_path;
var archives_disabled = false;
var default_archive_extns = [
    '.zip', '.tar', '.tgz', '.taz', '.z', '.gz', '.rar', '.7z'
];

exports.register = function () {
    try {
        tmp = require('tmp');
        tmp.setGracefulCleanup();
    }
    catch (e) {
        archives_disabled = true;
        this.logwarn('This plugin requires the \'tmp\' module to extract ' +
                     'filenames from archive files');
    }
    this.load_attachment_ini();
    this.register_hook('data_post', 'wait_for_attachment_hooks');
    this.register_hook('data_post', 'check_attachments');
};

exports.load_attachment_ini = function () {
    var plugin = this;

    plugin.cfg = plugin.config.get('attachment.ini', function () {
        plugin.load_attachment_ini();
    });

    plugin.cfg.timeout = (plugin.cfg.main.timeout || 30) * 1000;
    plugin.archive_max_depth = plugin.cfg.main.archive_max_depth || 5;
    plugin.archive_exts = options_to_array(plugin.cfg.main.archive_extensions) ||
                              default_archive_extns;
};

exports.find_bsdtar_path = function (cb) {
    var found = false;
    var i = 0;
    ['/bin', '/usr/bin', '/usr/local/bin'].forEach(function (dir) {
        if (found) return;
        i++;
        fs.stat(dir + '/bsdtar', function (err, stats) {
            i--;
            if (found) return;
            if (err) {
                if (i===0) cb(new Error('bsdtar not found'));
                return;
            }
            found = true;
            cb(null, dir);
        });
        if (i===0) cb(new Error('bsdtar not found'));
    });
};

exports.hook_init_master = exports.hook_init_child = function (next) {
    var plugin = this;
    plugin.find_bsdtar_path(function (err, dir) {
        if (err) {
            archives_disabled = true;
            plugin.logwarn('This plugin requires the \'bsdtar\' binary ' +
                            'to extract filenames from archive files');
        }
        else {
            plugin.logwarn('found bsdtar in ' + dir);
            bsdtar_path = dir + '/bsdtar';
        }
        return next();
    });
};

function options_to_array(options) {
    if (!options) return false;
    var arr = options.toLowerCase().replace(/\s+/,' ').split(/[;, ]/);
    var len = arr.length;
    while (len--) {
        // Remove any empty elements
        if (arr[len] === "" || arr[len] === null) {
            arr.splice(len, 1);
        }
        else {
            arr[len] = arr[len].trim();
        }
    }
    return (arr.length ? arr : false);
}

exports.unarchive_recursive = function(connection, f, archive_file_name, cb) {
    if (archives_disabled) {
        connection.logdebug(this, 'archive support disabled');
        return cb();
    }

    var plugin = this;
    var files = [];
    var tmpfiles = [];
    var depth_exceeded = false;
    var count = 0;
    var done_cb = false;
    var timer;

    function do_cb(err, files2) {
        if (timer) clearTimeout(timer);
        if (done_cb) return;
        done_cb = true;
        deleteTempFiles();
        return cb(err, files2);
    }

    function deleteTempFiles() {
        tmpfiles.forEach(function (t) {
            fs.close(t[0], function () {
                connection.logdebug(plugin, 'closed fd: ' + t[0]);
                fs.unlink(t[1], function() {
                    connection.logdebug(plugin, 'deleted tempfile: ' + t[1]);
                });
            });
        });
    }

    function listFiles(in_file, prefix, depth) {
        if (!depth) depth = 0;
        if (depth >= plugin.archive_max_depth || depth_exceeded) {
            if (count === 0) {
                return do_cb(new Error('maximum archive depth exceeded'));
            }
            return;
        }
        count++;
        var bsdtar = spawn(bsdtar_path, [ '-tf', in_file ], {
            'cwd': '/tmp',
            'env': { 'LANG': 'C' },
        });
        // Start timer
        var t1_timeout = false;
        var t1_timer = setTimeout(function () {
            t1_timeout = true;
            bsdtar.kill();
            return do_cb(new Error('bsdtar timed out'));
        }, plugin.cfg.timeout);
        var lines = "";
        bsdtar.stdout.on('data', function(data) {
            lines += data;
        });
        var stderr = "";
        bsdtar.stderr.on('data', function(data) {
            stderr += data;
        });
        bsdtar.on('exit', function (code, signal) {
            count--;
            if (t1_timeout) return;
            clearTimeout(t1_timer);
            if (code && code > 0) {
                // Error was returned
                return do_cb(new Error('bsdtar returned error code: ' + code +
                             ' error=' + stderr.replace(/\r?\n/,' ')));
            }
            if (signal) {
                // Process terminated due to signal
                return do_cb(new Error('bsdtar terminated by signal: ' + signal));
            }
            // Process filenames
            var fl = lines.split(/\r?\n/);
            for (var i=0; i<fl.length; i++) {
                var file = fl[i];
                // Skip any blank lines
                if (!file) continue;
                connection.logdebug(plugin, 'file: ' + file + ' depth=' + depth);
                files.push((prefix ? prefix + '/' : '') + file);
                var extn = path.extname(file.toLowerCase());
                if (plugin.archive_exts.indexOf(extn) === -1 &&
                    plugin.archive_exts.indexOf(extn.substring(1)) === -1)
                {
                    // Not an archive file extension
                    continue;
                }
                connection.logdebug(plugin, 'need to extract file: ' + file);
                count++;
                depth++;
                (function (file, depth) {
                    tmp.file(function (err, tmpfile, fd) {
                        count--;
                        if (err) return do_cb(err.message);
                        connection.logdebug(plugin, 'created tmp file: ' + tmpfile +
                                                  '(fd=' + fd + ') for file ' +
                                                  (prefix ? prefix + '/' : '') + file);
                        tmpfiles.push([fd, tmpfile]);
                        // Extract this file from the archive
                        count++;
                        var cmd = spawn(bsdtar_path,
                            [ '-Oxf', in_file, '--include=' + file ],
                            {
                                'cwd': '/tmp',
                                'env': {
                                    'LANG': 'C'
                                },
                            }
                        );
                        // Start timer
                        var t2_timeout = false;
                        var t2_timer = setTimeout(function () {
                            t2_timeout = true;
                            return do_cb(new Error('bsdtar timed out extracting file '
                                                   + file));
                        }, plugin.cfg.timeout);
                        // Create WriteStream for this file
                        var tws = fs.createWriteStream(tmpfile, { "fd": fd });
                        var err = "";
                        cmd.stderr.on('data', function(data) {
                            err += data;
                        });
                        cmd.on('exit', function (code, signal) {
                            count--;
                            if (t2_timeout) return;
                            clearTimeout(t2_timer);
                            if (code && code > 0) {
                                // Error was returned
                                return do_cb(new Error('bsdtar returned error code: '
                                             + code + ' error=' + err.replace(/\r?\n/,' ')));
                            }
                            if (signal) {
                                // Process terminated due to signal
                                return do_cb(new Error('bsdtar terminated by signal: '
                                                       + signal));
                            }
                            // Recurse
                            return listFiles(tmpfile, (prefix ? prefix + '/' : '') +
                                                      file, depth);
                        });
                        cmd.stdout.pipe(tws);
                    });
                })(file, depth);
            }
            connection.loginfo(plugin, 'finish: count=' + count +
                                       ' depth=' + depth);
            if (count === 0) {
                return do_cb(null, files);
            }
        });
    }

    timer = setTimeout(function () {
        return do_cb(new Error('timeout unpacking attachments'));
    }, plugin.cfg.timeout);

    listFiles(f, archive_file_name);
};

exports.start_attachment = function (connection, ctype, filename, body, stream) {
    var plugin = this;
    var txn = connection.transaction;

    function next() {
        if (txn.notes.attachment_count === 0 && txn.notes.attachment_next) {
            return txn.notes.attachment_next();
        }
        return;
    }

    // Parse Content-Type
    var ct;
    if ((ct = ctype.match(/^([^\/]+\/[^;\r\n ]+)/)) && ct[1]) {
        connection.logdebug(plugin, 'found content type: ' + ct[1]);
        txn.notes.attachment_ctypes.push(ct[1]);
    }

    // Parse filename
    if (filename) {
        var ext;
        var fileext = '.unknown';
        if ((ext = filename.match(/(\.[^\. ]+)$/)) && ext[1]) {
            fileext = ext[1].toLowerCase();
        }
        txn.notes.attachment_files.push(filename);
    }

    // Calculate and report the md5 of each attachment
    var md5 = crypto.createHash('md5');
    var digest;
    var bytes = 0;
    stream.on('data', function (data) {
        md5.update(data);
        bytes += data.length;
    });
    stream.once('end', function () {
        digest = md5.digest('hex');
        connection.loginfo(plugin, 'file="' + filename + '" ctype="' + ctype +
                                   '" md5=' + digest + ' bytes=' + bytes);
        txn.notes.attachments.push({
            ctype: ((ct && ct[1]) ? ct[1].toLowerCase() : 'unknown/unknown'),
            filename: (filename ? filename : ''),
            extension: (ext && ext[1] ? ext[1].toLowerCase() : ''),
            md5: ((digest) ? digest : ''),
        });
    });

    if (!filename) return;
    connection.logdebug(plugin, 'found attachment file: ' + filename);
    // See if filename extension matches archive extension list
    // We check with the dot prefixed and without
    if (archives_disabled || (plugin.archive_exts.indexOf(fileext) === -1 &&
        plugin.archive_exts.indexOf(fileext.substring(1)) === -1))
    {
        return;
    }
    connection.logdebug(plugin, 'found ' + fileext + ' on archive list');
    txn.notes.attachment_count++;
    stream.connection = connection;
    stream.pause();
    tmp.file(function (err, fn, fd) {
        function cleanup() {
            fs.close(fd, function() {
                connection.logdebug(plugin, 'closed fd: ' + fd);
                fs.unlink(fn, function () {
                    connection.logdebug(plugin, 'unlinked: ' + fn);
                });
            });
        }
        if (err) {
            txn.notes.attachment_result = [ DENYSOFT, err.message ];
            connection.logerror(plugin, 'Error writing tempfile: ' +
                                        err.message);
            txn.notes.attachment_count--;
            cleanup();
            stream.resume();
            return next();
        }
        connection.logdebug(plugin, 'Got tmpfile: attachment="' +
                                    filename + '" tmpfile="' + fn +
                                    '" fd=' + fd);
        var ws = fs.createWriteStream(fn);
        stream.pipe(ws);
        stream.resume();
        ws.on('error', function (error) {
            txn.notes.attachment_count--;
            txn.notes.attachment_result = [ DENYSOFT, error.message ];
            connection.logerror(plugin, 'stream error: ' + error.message);
            cleanup();
            return next();
        });
        ws.on('close', function() {
            connection.logdebug(plugin, 'end of stream reached');
            plugin.unarchive_recursive(connection, fn, filename, function (error, files) {
                txn.notes.attachment_count--;
                cleanup();
                if (err) {
                    connection.logerror(plugin, error.message);
                    if (err.message === 'maximum archive depth exceeded') {
                        txn.notes.attachment_result = [ DENY, 'Message contains nested archives exceeding the maximum depth' ];
                    }
                    else if (/Encrypted file is unsupported/i.test(error.message)) {
                        if (!plugin.cfg.main.allow_encrypted_archives) {
                            txn.notes.attachment_result = [ DENY, 'Message contains encrypted archive' ];
                        }
                    }
                    else if (/Mac metadata is too large/i.test(error.message)) {
                        // Skip this error
                    }
                    else {
                        if (!connection.relaying) {
                            txn.notes.attachment_result = [ DENYSOFT, 'Error unpacking archive' ];
                        }
                    }
                }
                else {
                    txn.notes.attachment_archive_files = txn.notes.attachment_archive_files.concat(files);
                }
                return next();
            });
        });
    });
}


exports.hook_data = function (next, connection) {
    var plugin = this;
    var txn = connection.transaction;
    txn.parse_body = 1;
    txn.notes.attachment_count = 0;
    txn.notes.attachments = [];
    txn.notes.attachment_ctypes = [];
    txn.notes.attachment_files = [];
    txn.notes.attachment_archive_files = [];
    txn.attachment_hooks(function (ctype, filename, body, stream) {
        plugin.start_attachment(connection, ctype, filename, body, stream);
    });
    return next();
};

exports.check_attachments = function (next, connection) {
    var txn = connection.transaction;
    var ctype_config = this.config.get('attachment.ctype.regex','list');
    var file_config = this.config.get('attachment.filename.regex','list');
    var archive_config = this.config.get('attachment.archive.filename.regex','list');

    // Add in any wildcard configuration
    var ctype_wc = this.config.get('attachment.ctype.wc', 'list');
    for (var i=0; i<ctype_wc.length; i++) {
        ctype_config.push(utils.wildcard_to_regexp(ctype_wc[i]));
    }
    var file_wc = this.config.get('attachment.filename.wc', 'list');
    for (var i=0; i<file_wc.length; i++) {
        file_config.push(utils.wildcard_to_regexp(file_wc[i]));
    }
    var archive_wc = this.config.get('attachment.archive.filename.wc', 'list');
    for (var i=0; i<archive_wc.length; i++) {
        archive_config.push(utils.wildcard_to_regexp(archive_wc[i]));
    }

    // Check for any stored errors from the attachment hooks
    if (txn.notes.attachment_result) {
        var result = txn.notes.attachment_result;
        return next(result[0], result[1]);
    }

    var ctypes = txn.notes.attachment_ctypes;

    // Add in any content type from message body
    var body = txn.body;
    var body_ct;
    if (body && (body_ct = /^([^\/]+\/[^;\r\n ]+)/.exec(body.header.get('content-type')))) {
        connection.logdebug(this, 'found content type: ' + body_ct[1]);
        ctypes.push(body_ct[1]);
    }
    // MIME parts
    if (body && body.children) {
        for (var c=0; c<body.children.length; c++) {
            var child_ct;
            if (body.children[c] && (child_ct = /^([^\/]+\/[^;\r\n ]+)/.exec(body.children[c].header.get('content-type')))) {
                connection.logdebug(this, 'found content type: ' + child_ct[1]);
                ctypes.push(child_ct[1]);
            }
        }
    }

    var ctypes_result = this.check_items_against_regexps(ctypes, ctype_config);
    if (ctypes_result) {
        connection.loginfo(this, 'match ctype="' + ctypes_result[0] + '" regexp=/' + ctypes_result[1] + '/');
        return next(DENY, 'Message contains unacceptable content type (' + ctypes_result[0] + ')');
    }

    var files = txn.notes.attachment_files;
    var files_result = this.check_items_against_regexps(files, file_config);
    if (files_result) {
        connection.loginfo(this, 'match file="' + files_result[0] + '" regexp=/' + files_result[1] + '/');
        return next(DENY, 'Message contains unacceptable attachment (' + files_result[0] + ')');
    }

    var archive_files = txn.notes.attachment_archive_files;
    var archives_result = this.check_items_against_regexps(archive_files, archive_config);
    if (archives_result) {
        connection.loginfo(this, 'match file="' + archives_result[0] + '" regexp=/' + archives_result[1] + '/');
        return next(DENY, 'Message contains unacceptable attachment (' + archives_result[0] + ')');
    }

    return next();
};

exports.check_items_against_regexps = function (items, regexps) {
    if ((regexps && Array.isArray(regexps) && regexps.length > 0) &&
        (items && Array.isArray(items) && items.length > 0))
    {
        for (var r=0; r < regexps.length; r++) {
            var reg;
            try {
                reg = new RegExp(regexps[r], 'i');
            }
            catch (e) {
                this.logerror('skipping invalid regexp: /' + regexps[r] + '/ (' + e + ')');
            }
            if (reg) {
                for (var i=0; i < items.length; i++) {
                    if (reg.test(items[i])) {
                        return [ items[i], regexps[r] ];
                    }
                }
            }
        }
    }
    return false;
};

exports.wait_for_attachment_hooks = function (next, connection) {
    var txn = connection.transaction;
    if (txn.notes.attachment_count > 0) {
        // We still have attachment hooks running
        txn.notes.attachment_next = next;
    }
    else {
        next();
    }
};

