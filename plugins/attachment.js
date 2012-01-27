// attachment 

exports.hook_data = function (next, connection) {
    var plugin = this;
    var transaction = connection.transaction;
    transaction.parse_body = 1;
    transaction.notes.attachment_ctypes = [];
    transaction.notes.attachment_files = [];
    transaction.attachment_hooks(function (ctype, filename, body) {
        // Parse Content-Type
        var ct
        if ((ct = ctype.match(/^([^\/]+\/[^;\r\n ]+)/)) && ct[1]) {
            connection.logdebug(plugin, 'found content type: ' + ct[1]);
            transaction.notes.attachment_ctypes.push(ct[1]);
        }
        if (filename) {
            connection.logdebug(plugin, 'found attachment file: ' + filename);
            transaction.notes.attachment_files.push(filename);
        }
    });
    return next();
}   

exports.hook_data_post = function (next, connection) {
    var transaction = connection.transaction;
    var ctype_config = this.config.get('attachment.ctype.regex','list');
    var file_config = this.config.get('attachment.filename.regex','list');

    var ctypes = transaction.notes.attachment_ctypes;
    
    // Add in any content type from message body
    var body = transaction.body;
    var body_ct;
    if ((body_ct = /^([^\/]+\/[^;\r\n ]+)/.exec(body.header.get('content-type')))) {
        connection.logdebug(this, 'found content type: ' + body_ct[1]);
        ctypes.push(body_ct[1]);
    }
    // MIME parts
    for (var c=0; c<body.children.length; c++) {
        var child_ct;
        if ((child_ct = /^([^\/]+\/[^;\r\n ]+)/.exec(body.children[c].header.get('content-type')))) {
            connection.logdebug(this, 'found content type: ' + child_ct[1]);
            ctypes.push(child_ct[1]);
        }
    }

    if ((ctypes && ctypes.length > 0) &&
        (ctype_config && ctype_config.length > 0)) 
    {
        for (var c=0; c < ctype_config.length; c++) {
            var ctype_regex;
            try {
                ctype_regex = new RegExp(ctype_config[c], 'i');
            }
            catch (e) {
                connection.logwarn(this, 'skipping invalid regexp: /' + ctype_config[c] + '/ (' + e + ')');
            }
            if (ctype_regex) {
                for (var i=0; i < ctypes.length; i++) {
                    if (ctype_regex.test(ctypes[i])) {
                        connection.loginfo(this, 'match ctype="' + ctypes[i] + '" regexp=/' + ctype_config[c] + '/');
                        return next(DENY, 'Message rejected: contains ' + ctypes[i] + ' message part');
                    }
                }
            }
        }
    }

    var files = transaction.notes.attachment_files;
    if ((files && files.length > 0) &&
        (file_config && file_config.length > 0))
    {
        for (var f=0; f<file_config.length; f++) {
            var file_regex;
            try {
                file_regex = new RegExp(file_config[f], 'i');
            }
            catch (e) {
                connection.logwarn(this, 'skipping invalid regexp: /' + file_config[c] + '/ (' + e + ')');
            }
            if (file_regex) {
                for (var i=0; i < files.length; i++) {
                    if (file_regex.test(files[i])) {
                        connection.loginfo(this, 'match file="' + files[i] + '" regexp=/' + file_config[f] + '/');
                        return next(DENY, 'Message rejected: contains unacceptable attachment (' + files[i] + ')');
                    }
                }
            }
        }
    }

    // Nothing found
    return next();
}
