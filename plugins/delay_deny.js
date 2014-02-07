/*
** delay_deny
**
** This plugin delays all pre-DATA 'deny' results until the recipients are sent
** and all post-DATA commands until all hook_data_post plugins have run.
** This allows relays and authenticated users to bypass pre-DATA rejections.
*/

exports.hook_deny = function (next, connection, params) {
    /* params
    ** [0] = plugin return value (DENY or DENYSOFT)
    ** [1] = plugin return message
    */

    var pi_name     = params[2];
    var pi_function = params[3];
    var pi_params   = params[4];
    var pi_hook     = params[5];

    var plugin = this;
    var transaction = connection.transaction;

    // Don't delay ourselves...
    if (pi_name == 'delay_deny') return next();

    // Load config
    var cfg = this.config.get('delay_deny.ini');
    var skip;
    if (cfg.main.excluded_plugins) {
        skip = cfg.main.excluded_plugins.split(/[;, ]+/);
    }

    // See if we should skip this delay
    if (skip && skip.length) {
        // Skip by <plugin name>
        if (skip.indexOf(pi_name) !== -1) {
            connection.logdebug(plugin, 'not delaying excluded plugin: ' + pi_name);
            return next();
        }
        // Skip by <plugin name>:<hook>
        if (skip.indexOf(pi_name + ':' + pi_hook) !== -1) {
            connection.logdebug(plugin, 'not delaying excluded hook: ' + pi_hook +
                                      ' in plugin: ' + pi_name);
            return next();
        }
        // Skip by <plugin name>:<hook>:<function name>
        if (skip.indexOf(pi_name + ':' + pi_hook + ':' + pi_function) !== -1) {
            connection.logdebug(plugin, 'not delaying excluded function: ' + pi_function +
                                      ' on hook: ' + pi_hook + ' in plugin: ' + pi_name);
            return next();
        }
    }

    switch(pi_hook) {
        // Pre-DATA connection delays
        case 'lookup_rdns':
        case 'connect':
        case 'ehlo':
        case 'helo':
            if (!connection.notes.delay_deny_pre) {
                connection.notes.delay_deny_pre = [];
            }
            connection.notes.delay_deny_pre.push(params);
            if (!connection.notes.delay_deny_pre_fail) {
                connection.notes.delay_deny_pre_fail = {};
            }
            connection.notes.delay_deny_pre_fail[pi_name] = 1;
            return next(OK);
        // Pre-DATA transaction delays
        case 'mail':
        case 'rcpt':
        case 'rcpt_ok':
            if (!transaction.notes.delay_deny_pre) {
                transaction.notes.delay_deny_pre = [];
            }
            transaction.notes.delay_deny_pre.push(params);
            if (!transaction.notes.delay_deny_pre_fail) {
                transaction.notes.delay_deny_pre_fail = {};
            }
            transaction.notes.delay_deny_pre_fail[pi_name] = 1;
            return next(OK);
        // Post-DATA delays 
        case 'data':
        case 'data_post':
            /*  Delays disabled for now
            if (!transaction.notes.delay_deny_post) {
                transaction.notes.delay_deny_post = [];
            }
            transaction.notes.delay_deny_post.push(params);
            if (!transaction.notes.delay_deny_post_fail) {
                transaction.notes.delay_deny_post_fail = {};
            }
            transaction.notes.delay_deny_post_fail[pi_name] = 1;
            return next(OK);
            break;
            */
        default:
            // No delays
            return next();
    }
};

exports.hook_rcpt_ok = function (next, connection, rcpt) {
    var plugin = this;
    var transaction = connection.transaction;

    // Bypass all pre-DATA deny for AUTH/RELAY
    if (connection.relaying) {
        connection.loginfo(plugin, 'bypassing all pre-DATA deny: AUTH/RELAY');
        return next();
    }

    // Apply any delayed rejections
    // Check connection level pre-DATA rejections first
    if (connection.notes.delay_deny_pre) {
        for (var i=0; i<connection.notes.delay_deny_pre.length; i++) {
            var params = connection.notes.delay_deny_pre[i];
            return next(params[0], params[1]);
        }
    }

    // Then check transaction level pre-DATA
    if (transaction.notes.delay_deny_pre) {
        for (var i=0; i<transaction.notes.delay_deny_pre.length; i++) {
            var params = transaction.notes.delay_deny_pre[i];

            // Remove rejection from the array if it was on the rcpt hooks
            if (params[5] === 'rcpt' || params[5] === 'rcpt_ok') {
                transaction.notes.delay_deny_pre.splice(i, 1);
            }

            return next(params[0], params[1]);
        }
    }
    return next();
};

exports.hook_data = function (next, connection) {
    var transaction = connection.transaction;

    // Add a header showing all pre-DATA rejections
    var fails = [];
    if (connection.notes.delay_deny_pre_fail) {
        fails.push.apply(Object.keys(connection.notes.delay_deny_pre_fail));
    }
    if (transaction.notes.delay_deny_pre_fail) {
        fails.push.apply(Object.keys(transaction.notes.delay_deny_pre_fail));
    }
    if (fails.length) transaction.add_header('X-Haraka-Fail-Pre', fails.join(' '));

    return next();
}
