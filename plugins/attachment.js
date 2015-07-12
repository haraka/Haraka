// attachment

var fs     = require('fs');
var spawn  = require('child_process').spawn;
var exec   = require('child_process').exec;
var path   = require('path');
var crypto = require('crypto');

var utils = require('./utils');

var tmp;
var archives_disabled = false;

exports.register = function () {
    try {
        tmp = require('tmp');
        tmp.setGracefulCleanup();
    }
    catch (e) {
        archives_disabled = true;
        this.logwarn('This module requires the \'tmp\' module to extract ' +
            'filenames from archive files');
        return;
    }

    this.load_attachment_ini();
    this.load_n_compile_re('file',    'attachment.filename.regex');
    this.load_n_compile_re('ctype',   'attachment.ctype.regex');
    this.load_n_compile_re('archive', 'attachment.archive.filename.regex');

    this.register_hook('data_post', 'wait_for_attachment_hooks');
    this.register_hook('data_post', 'check_attachments');
};

exports.load_attachment_ini = function () {
    var plugin = this;

    plugin.cfg = plugin.config.get('attachment.ini', function () {
        plugin.load_attachment_ini();
    });

    plugin.cfg.timeout = (plugin.cfg.main.timeout || 30) * 1000;

    // repair a mismatch between legacy docs and code
    var extns = (plugin.cfg.archive && plugin.cfg.archive.extensions) ?
                plugin.cfg.archive.extensions :      // new
                plugin.cfg.main.archive_extensions ? // old code
                plugin.cfg.main.archive_extensions :
                plugin.cfg.main.archive_extns ?      // old docs
                plugin.cfg.main.archive_extns :
                '';

    var maxd = (plugin.cfg.archive && plugin.cfg.archive.max_depth) ?
                plugin.cfg.main.archive.max_depth :   // new
                plugin.cfg.main.archive_max_depth ?   // old
                plugin.cfg.main.archive_max_depth :
                5;                                    // default

    plugin.cfg.archive = {
        max_depth: maxd,
        exts : plugin.options_to_object(extns) ||
               plugin.options_to_object('zip tar tgz taz z gz rar 7z'),
    };

    plugin.load_dissallowed_extns();
};

exports.load_dissallowed_extns = function () {
    var plugin = this;

    if (!plugin.cfg.main.disallowed_extensions) return;

    if (!plugin.re) plugin.re = {};
    plugin.re.bad_extn = new RegExp(
            '\\.(?:' +
                (plugin.cfg.main.disallowed_extensions
                .replace(/\s+/,' ')
                .split(/[;, ]/)
                .join('|')) +
            ')$', 'i');
};

exports.load_n_compile_re = function (name, file) {
    var plugin = this;
    var valid_re = [];

    var try_re = plugin.config.get(file, 'list', function () {
        plugin.load_compile_re(name, file);
    });

    for (var r=0; r < try_re.length; r++) {
        try {
            var reg = new RegExp(try_re[r], 'i');
        }
        catch (e) {
            this.logerror('skipping invalid regexp: /' + try_re[r] +
                    '/ (' + e + ')');
            return;
        }
        valid_re.push(reg);
    }

    if (!plugin.re) plugin.re = {};
    plugin.re[name] = valid_re;
};

exports.options_to_object = function (options) {
    if (!options) return false;

    var res = {};
    options.toLowerCase().replace(/\s+/,' ').split(/[;, ]/)
        .forEach(function (opt) {
            if (!opt) return;
            if (opt[0] !== '.') opt = '.' + opt;
            res[opt.trim()]=true;
        });

    if (Object.keys(res).length) return res;
    return false;
};

exports.unarchive_recursive = function(connection, f, archive_file_name, cb) {
    var plugin = this;

    if (archives_disabled) {
        connection.logdebug(this, 'archive support disabled');
        return cb();
    }

    var self = this;
    var files = [];
    var tmpfiles = [];
    var depth_exceeded = false;
    var count = 0;
    var done_cb = false;
    var timer;

    function do_cb(err, files) {
        if (timer) clearTimeout(timer);
        if (done_cb) return;
        done_cb = true;
        deleteTempFiles();
        return cb(err, files);
    }

    function deleteTempFiles() {
        tmpfiles.forEach(function (t) {
            fs.close(t[0], function () {
                connection.logdebug(self, 'closed fd: ' + t[0]);
                fs.unlink(t[1], function() {
                    connection.logdebug(self, 'deleted tempfile: ' + t[1]);
                });
            });
        });
     }

    function listFiles(in_file, prefix, depth) {
        if (!depth) depth = 0;
        if (depth >= plugin.cfg.archive.max_depth || depth_exceeded) {
            if (count === 0) {
                return do_cb(new Error('maximum archive depth exceeded'));
            }
            return;
        }
        count++;
        var cmd = 'LANG=C bsdtar -tf ' + in_file;
        var bsdtar = exec(cmd, { timeout: plugin.cfg.timeout },  function (err, stdout, stderr) {
            count--;
            if (err) {
                if (err.code === 127) {
                    // file not found
                    self.logwarn('bsdtar not found, disabling archive features');
                    archives_disabled = true;
                    return do_cb();
                }
                else if (err.code === null) {
                    // likely a timeout
                    return do_cb(new Error('timeout unpacking attachments'));
                }
                return do_cb(err);
            }
            var f = stdout.split(/\r?\n/);
            for (var i=0; i<f.length; i++) {
                var file = f[i];
                // Skip any blank lines
                if (!file) continue;
                connection.logdebug(self, 'file: ' + file + ' depth=' + depth);
                files.push((prefix ? prefix + '/' : '') + file);
                var extn = path.extname(file.toLowerCase());
                if (plugin.cfg.archive.exts[extn] ||
                    plugin.cfg.archive.exts[extn.substring(1)])
                {
                    connection.logdebug(self, 'need to extract file: ' + file);
                    count++;
                    depth++;
                    (function (file, depth) {
                    tmp.file(function (err, tmpfile, fd) {
                        count--;
                        if (err) return do_cb(err.message);
                        connection.logdebug(self, 'created tmp file: ' + tmpfile + '(fd=' + fd + ') for file ' + (prefix ? prefix + '/' : '') + file);
                        // Extract this file from the archive
                        var cmd = 'LANG=C bsdtar -Oxf ' + in_file + ' --include="' + file + '" > ' + tmpfile;
                        tmpfiles.push([fd, tmpfile]);
                        connection.logdebug(self, 'running command: ' + cmd);
                        count++;
                        exec(cmd, { timeout: plugin.cfg.timeout }, function (error, stdout, stderr) {
                            count--;
                            if (error) {
                                connection.logdebug(self, 'error: return code ' + error.code + ': ' + stderr.toString('utf-8'));
                                return do_cb(new Error(stderr.toString('utf-8').replace(/\r?\n/g,' ')));
                            }
                            else {
                                // Recurse
                                return listFiles(tmpfile, (prefix ? prefix + '/' : '') + file, depth);
                            }
                        });
                    });
                    })(file, depth);
                }
            }
            if (depth > 0) depth--;
            connection.logdebug(self, 'finish: count=' + count + ' depth=' + depth);
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

    function next () {
        if (txn.notes.attachment_count === 0 && txn.notes.attachment_next) {
            return txn.notes.attachment_next();
        }
        return;
    }

    // Calculate and report the md5 of each attachment
    var md5 = crypto.createHash('md5');
    var digest;
    var bytes = 0;
    stream.on('data', function (data) {
        bytes += data.length;
        md5.update(data);
    });
    stream.once('end', function () {
        digest = md5.digest('hex');
        var ca = ctype.match(/^(.*)?;\s+name="(.*)?"/);
        txn.results.push(plugin, { attach: {
                file: filename,
                ctype: (ca && ca[2] === filename) ? ca[1] : ctype,
                md5: digest,
                bytes: bytes,
            },
        });
        connection.loginfo(plugin, 'file="' + filename + '" ctype="' +
                ctype + '" md5=' + digest);
    });

    // Parse Content-Type
    var ct = ctype.match(/^([^\/]+\/[^;\r\n ]+)/);
    if (ct && ct[1]) {
        connection.logdebug(plugin, 'found content type: ' + ct[1]);
        txn.notes.attachment_ctypes.push(ct[1]);
    }
    if (filename) {
        connection.logdebug(plugin, 'found attachment file: ' + filename);
        var ext = filename.match(/(\.[^\. ]+)$/);
        var fileext = '.unknown';
        if (ext && ext[1]) {
            fileext = ext[1].toLowerCase();
        }
        txn.notes.attachment_files.push(filename);
        // See if filename extension matches archive extension list
        // We check with the dot prefixed and without
        if (!archives_disabled && (plugin.cfg.archive.exts[fileext] ||
            plugin.cfg.archive.exts[fileext.substring(1)]))
        {
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
                    connection.logerror(plugin, 'Error writing tempfile: ' + err.message);
                    txn.notes.attachment_count--;
                    cleanup();
                    stream.resume();
                    return next();
                }
                connection.logdebug(plugin, 'Got tmpfile: attachment="' + filename + '" tmpfile="' + fn + '" fd=' + fd);
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
                    plugin.unarchive_recursive(connection, fn, filename, function (err, files) {
                        txn.notes.attachment_count--;
                        cleanup();
                        if (err) {
                            connection.logerror(plugin, err.message);
                            if (err.message === 'maximum archive depth exceeded') {
                                txn.notes.attachment_result = [ DENY, 'Message contains nested archives exceeding the maximum depth' ];
                            }
                            else if (/Encrypted file is unsupported/i.test(err.message)) {
                                txn.notes.attachment_result = [ DENY, 'Message contains encrypted archive' ];
                            }
                            else {
                                txn.notes.attachment_result = [ DENYSOFT, 'Error unpacking archive' ];
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
    }
    txn.notes.attachments.push({
        ctype: ((ct && ct[1]) ? ct[1].toLowerCase() : 'unknown/unknown'),
        filename: (filename ? filename : ''),
        extension: (ext && ext[1] ? ext[1].toLowerCase() : ''),
    });
};

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

exports.disallowed_extensions = function (txn) {
    var plugin = this;
    if (!plugin.re.bad_extn) return false;

    var bad = false;
    [ txn.notes.attachment_files, txn.notes.attachment_archive_files ]
    .forEach(function (items) {
        if (bad) return;
        if (!items || !Array.isArray(items)) return;
        for (var i=0; i < items.length; i++) {
            if (!plugin.re.bad_extn.test(items[i])) continue;
            bad = items[i].split('.').slice(0).pop();
            break;
        }
    });

    return bad;
};

exports.check_attachments = function (next, connection) {
    var plugin = this;
    var txn = connection.transaction;

    // Check for any stored errors from the attachment hooks
    if (txn.notes.attachment_result) {
        var result = txn.notes.attachment_result;
        return next(result[0], result[1]);
    }

    var ctypes = txn.notes.attachment_ctypes;

    // Add in any content type from message body
    var ct_re = /^([^\/]+\/[^;\r\n ]+)/;
    var body = txn.body;
    if (body) {
        var body_ct = ct_re.exec(body.header.get('content-type'));
        if (body_ct) {
            connection.logdebug(this, 'found content type: ' + body_ct[1]);
            ctypes.push(body_ct[1]);
        }
    }
    // MIME parts
    if (body && body.children) {
        for (var c=0; c<body.children.length; c++) {
            if (!body.children[c]) continue;
            var child_ct = ct_re.exec(
                    body.children[c].header.get('content-type'));
            if (!child_ct) continue;
            connection.logdebug(this, 'found content type: ' + child_ct[1]);
            ctypes.push(child_ct[1]);
        }
    }

    var bad_extn = this.disallowed_extensions(txn);
    if (bad_extn) {
        return next(DENY, 'Message contains disallowed file extension (' +
                    bad_extn + ')');
    }

    var ctypes_result = this.check_items_against_regexps(ctypes, plugin.re.ctype);
    if (ctypes_result) {
        connection.loginfo(this, 'match ctype="' + ctypes_result[0] + '" regexp=/' + ctypes_result[1] + '/');
        return next(DENY, 'Message contains unacceptable content type (' + ctypes_result[0] + ')');
    }

    var files = txn.notes.attachment_files;
    var files_result = this.check_items_against_regexps(files, plugin.re.file);
    if (files_result) {
        connection.loginfo(this, 'match file="' + files_result[0] + '" regexp=/' + files_result[1] + '/');
        return next(DENY, 'Message contains unacceptable attachment (' + files_result[0] + ')');
    }

    var archive_files = txn.notes.attachment_archive_files;
    var archives_result = this.check_items_against_regexps(archive_files, plugin.re.archive);
    if (archives_result) {
        connection.loginfo(this, 'match file="' + archives_result[0] + '" regexp=/' + archives_result[1] + '/');
        return next(DENY, 'Message contains unacceptable attachment (' + archives_result[0] + ')');
    }

    return next();
};

exports.check_items_against_regexps = function (items, regexps) {
    if (!regexps || !items) return false;
    if (!Array.isArray(regexps) || !Array.isArray(items)) return false;
    if (!regexps.length || !items.length) return false;

    for (var r=0; r < regexps.length; r++) {
        for (var i=0; i < items.length; i++) {
            if (regexps[r].test(items[i])) {
                return [ items[i], regexps[r] ];
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
