'use strict';
/* jshint maxdepth: 5 */

var wss = { broadcast: function () {} };
var watchers = 0;

exports.register = function () {
    var plugin = this;
    plugin.inherits('redis');

    plugin.load_watch_ini();

    [
        'lookup_rdns', 'connect', 'helo', 'ehlo', 'mail', 'rcpt', 'rcpt_ok',
        'data', 'data_post', 'reset_transaction'
    ]
    .forEach(function (hook) {
        plugin.register_hook(hook,  'get_incremental_results');
    });
    plugin.register_hook('queue_ok',     'queue_ok');
    plugin.register_hook('deny',         'w_deny');
    plugin.register_hook('disconnect',   'disconnect');

    plugin.utils = plugin.core_require('utils');
};

exports.load_watch_ini = function () {
    var plugin = this;
    plugin.cfg = plugin.config.get('watch.ini', {
        booleans:  ['-main.sampling'],
    },
    function () {
        plugin.load_watch_ini();
    });
};

exports.hook_init_http = function (next, server) {
    var plugin = this;

    server.http.app.use('/watch/wss_conf', function (req, res) {
        // app.use args: request, response, app_next
        // pass config information to the WS client
        var client = { sampling: plugin.cfg.main.sampling };
        if (plugin.cfg.wss && plugin.cfg.wss.url) {
            client.wss_url = plugin.cfg.wss.url;
        }
        res.end(JSON.stringify(client));
    });

    var htdocs = __dirname + '/html';
    if (plugin.cfg.wss && plugin.cfg.wss.htdocs) {
        htdocs = plugin.cfg.wss.htdocs;
    }
    server.http.app.use('/watch/', server.http.express.static(htdocs));

    plugin.loginfo('watch init_http done');
    return next();
};

exports.hook_init_wss = function (next, server) {
    var plugin = this;
    plugin.loginfo('watch init_wss');

    wss = server.http.wss;

    wss.on('error', function (error) {
        plugin.loginfo("server error: " + error);
    });

    wss.on('connection', function (ws) {
        watchers++;
        // broadcast updated watcher count
        wss.broadcast({ watchers: watchers });

        // plugin.logdebug("client connected: " + Object.keys(ws));
        //
        // send message to just this websocket
        // ws.send('welcome!');

        ws.on('error', function (error) {
            plugin.logdebug("client error: " + error);
        });

        ws.on('close', function (code, message) {
            plugin.logdebug("client closed: " + message + '('+code+')');
            watchers--;
        });

        ws.on('message', function (message) {
            plugin.logdebug("received from client: " + message);
        });
    });

    wss.broadcast = function (data) {
        var f = JSON.stringify(data);
        for (var i in this.clients) {
            this.clients[i].send(f);
        }
    };

    plugin.loginfo('watch init_wss done');
    return next();
};

exports.hook_connect_init = function (next, connection) {
    var plugin = this;

    if (!server.notes.redis) {
        connection.logerror(plugin, "no server.notes.redis!");
        return next();
    }

    plugin.redis_subscribe(connection, function () {
        connection.notes.redis.on('pmessage', function (pattern, channel, message) {
            plugin.check_redis_sub_msg(connection, message);
        });
        next();
    });
};

exports.check_redis_sub_msg = function (connection, message) {
    var plugin = this;
    // connection.loginfo(plugin, message);
    // {"plugin":"karma","result":{"fail":"spamassassin.hits"}}
    // {"plugin":"connect.geoip","result":{"country":"CN"}}

    var m = JSON.parse(message);
    connection.logprotocol(plugin, message);

    var req = { uuid : connection.uuid };
    req[m.plugin] = m.result;

    wss.broadcast(req);
};

exports.get_incremental_results = function (next, connection) {
    var plugin = this;

    plugin.get_connection_results(connection);
    if (connection.transaction) {
        plugin.get_transaction_results(connection.transaction);
    }

    return next();
};

exports.queue_ok = function (next, connection) {
    // queue_ok arguments: next, connection, msg
    // ok 1390590369 qp 634 (F82E2DD5-9238-41DC-BC95-9C3A02716AD2.1)

    var incrDone = function () {
        wss.broadcast({
            uuid: connection.transaction.uuid,
            queue: { classy: 'bg_green' },
        });
        next();
    };

    this.get_incremental_results(incrDone, connection);
};

exports.w_deny = function (next, connection, params) {
    var plugin = this;
    // this.loginfo(this, params);
    var pi_code   = params[0];  // deny code?
    // var pi_msg    = params[1];  // deny error
    var pi_name   = params[2];  // plugin name
    // var pi_function = params[3];
    // var pi_params   = params[4];
    var pi_hook   = params[5];

    connection.loginfo(this, "watch deny saw: " + pi_name +
            ' deny from ' + pi_hook);

    this.get_connection_results(connection);
    if (connection.transaction) {
        this.get_transaction_results(connection.transaction);
    }

    var req = {
        uuid: connection.transaction ? connection.transaction.uuid
                                     : connection.uuid,
        local_port: { classy: 'bg_white', title: 'disconnected' },
        remote_host:  get_remote_host(connection),
    };

    connection.logdebug(this, "watch sending dark red to "+pi_name);
    var bg_class = pi_code === DENYSOFT ? 'bg_dyellow' : 'bg_dred';
    var report_as = plugin.get_plugin_name(pi_name);
    if (req[report_as]) req[report_as].classy = bg_class;
    if (!req[report_as]) req[report_as] = { classy: bg_class };

    wss.broadcast(req);
    return next();
};

exports.disconnect = function (next, connection) {

    var incrDone = function () {
        wss.broadcast( {
            uuid: connection.uuid,
            local_port: { classy: 'bg_white', title: 'disconnected' },
        });
        next();
    };

    this.get_incremental_results(incrDone, connection);
    this.redis_unsubscribe(connection);
};

exports.get_connection_results = function (connection) {
    var plugin = this;

    var au = connection.notes.auth_user;

    var req = {
        uuid       : connection.uuid,
        local_port : get_local_port(connection),
        remote_host: get_remote_host(connection),
        tls        : get_tls(connection),
        auth       : au ? { classy: 'bg_green', title: au } : '',
        relay      : get_relay(connection),
        helo       : get_helo(connection),
        early      : get_early,
        queue      : { newval: plugin.utils.elapsed(connection.start_time) },
    };

    // see if changed since we last sent
    [ 'local_port', 'remote_host', 'tls', 'auth', 'relay', 'helo', 'early'
    ].forEach(function (val) {
        if (JSON.stringify(req[val]) ===
            JSON.stringify(connection[val + '_watch'])) {
            // same as last time, don't send
            delete req[val];
        }
        else {
            // cache, so we can compare on the next run
            connection[val + '_watch'] = JSON.stringify(req[val]);
        }
    });

    var result_store = connection.results.get_all();
    for (var name in result_store) {
        plugin.get_plugin_result(req, result_store, name);
    }

    wss.broadcast(req);
};

exports.get_transaction_results = function (txn) {
    var plugin = this;
    if (!txn) return;

    var req = {
        uuid:  txn.uuid,
        mail_from: get_mailfrom(txn),
        rcpt_to: get_recipients(txn),
    };

    var result_store = txn.results.get_all();
    for (var name in result_store) {
        plugin.get_plugin_result(req, result_store, name);
    }

    wss.broadcast(req);
};

exports.get_plugin_name = function (pi_name) {

    // coalesce auth/* and queue/* plugins to 'auth' and 'queue'
    if (/^(queue|auth)\//.test(pi_name)) {
        return pi_name.split('/').shift();
    }

    return pi_name;
};

exports.get_plugin_result = function (req, res, name) {
    var plugin = this;
    if (name[0] === '_') return;  // ignore anything with leading _

    var formatted = plugin.format_results(name, res[name]);
    if (res[name]._watch_saw === JSON.stringify(formatted)) {
        // plugin.loginfo(name + ' skip, same as cached');
        return;  // don't report
    }

    // save to request that gets sent to client
    // plugin.loginfo(name + ' saved to res');
    req[ plugin.get_plugin_name(name) ] = formatted;

    // cache formatted result to avoid sending dups to client
    res[name]._watch_saw = JSON.stringify(formatted);
};

exports.format_results = function (pi_name, r) {
    var plugin = this;
    var s = {
        title:  plugin.get_title(pi_name, r),
        classy: plugin.get_class(pi_name, r),
    };

    var newval = plugin.get_value(pi_name, r);
    if (newval) s.newval = newval;

    if (pi_name === 'spf') { s.scope = r.scope; }
    return s;
};

exports.get_class = function (pi_name, r) {

    switch (pi_name) {
        case 'bounce':
            if (r.isa === 'no') return 'bg_lgreen';
            if (r.fail.length)  return 'bg_red';
            return 'bg_green';
        case 'connect.geoip':
            return (!r.distance) ? 'got' : (r.too_far ? 'bg_red' : 'bg_green');
        case 'connect.p0f':
            if (r.os_name) {
                if (/freebsd|mac|ios/i.test(r.os_name)) return 'bg_green';
                if (/windows/i.test(r.os_name)) return 'bg_red';
            }
            return 'got';
        case 'data.dmarc':
            if (!r.result) return 'got';
            var comment = (r.reason && r.reason.length) ?
                           r.reason[0].comment : '';
            return r.result === 'pass'      ? 'bg_green' :
                    comment === 'no policy' ? 'bg_yellow' : 'bg_red';
        case 'data.uribl':
            return r.fail.length ? 'bg_red' : 'bg_lgreen';
        case 'dnsbl':
            return r.fail.length ? 'bg_red' :
                   r.pass.length ? 'bg_green' : 'bg_lgreen';
        case 'helo.checks':
            return r.fail.length > 2 ? 'bg_red' :
                   r.fail.length > 0 ? 'bg_yellow' :
                   r.pass.length > 5 ? 'bg_green' : 'bg_lgreen';
        case 'karma':
            if (r.score === undefined) {
                var history = parseFloat(r.history) || 0;
                return history >  2 ? 'bg_green' :
                       history < -1 ? 'bg_red'   : 'bg_yellow';
            }
            var score = parseFloat(r.score) || 0;
            return score > 3  ? 'bg_green'  :
                   score > 0  ? 'bg_lgreen' :
                   score < -3 ? 'bg_red'    :
                   score < 0  ? 'bg_lred'   : 'bg_yellow';
        case 'relay':
            return (r.pass.length && r.fail.length === 0) ? 'bg_green' :
                    r.pass.length ? 'bg_lgreen' :
                    r.fail.length ? 'bg_red'    :
                    r.err.length  ? 'bg_yellow' : '';
        case 'rcpt_to.qmail_deliverable':
            return (r.pass.length && r.fail.length === 0) ? 'bg_green' :
                    r.pass.length ? 'bg_lgreen' : '';
        case 'rcpt_to.in_host_list':
            return (r.pass.length && r.fail.length === 0) ? 'bg_green' :
                    r.pass.length ? 'bg_lgreen' : '';
        case 'spamassassin':
            var hits = parseFloat(r.hits);
            return hits > 5 ? 'bg_red' :
                   hits > 2 ? 'bg_yellow' :
                   hits < 0 ? 'bg_green' : 'bg_lgreen';
        case 'spf':
            return r.result === 'Pass' ? 'bg_green' :
                   r.result === 'Neutral' ? 'bg_lgreen' :
                   /fail/i.test(r.result) ? 'bg_red' :
                   /error/i.test(r.result) ? 'bg_yellow' : '';
        case 'rspamd':
            return r.is_spam === true ? 'bg_red' :
                   r.action  === 'greylist' ? 'bg_grey' :
                   r.is_skipped === true ? '' :
                   r.score > 5 ? 'bg_lred' :
                   r.score < 0 ? 'bg_green' :
                   r.score < 3 ? 'bg_lgreen' : 'bg_yellow';
        default:
            return (r.pass.length && r.fail.length === 0) ? 'bg_green' :
                    r.pass.length ? 'bg_lgreen' :
                    r.fail.length ? 'bg_red'    :
                    r.err.length  ? 'bg_yellow' :
                                    'bg_lgreen';
    }
};

exports.get_value = function (pi_name, r) {

    // replace the plugin name shown with...
    switch (pi_name) {
        case 'connect.asn':
            return r.asn;
        case 'connect.p0f':
            return r.os_name;
        case 'connect.geoip':
            return r.country || 'geo';
        default:
            return;
    }
};

exports.get_title = function (pi_name, r) {
    // title: the value shown in the HTML tooltip

    switch (pi_name) {
        case 'spamassassin':
            var hits = parseFloat(r.hits);
            return r.flag + ', ' + hits + ' hits, time: ' + r.time;
        case 'connect.p0f':
            return r.os_name +' '+ r.os_flavor + ', ' + r.distance + ' hops';
        case 'bounce':
            if (r.isa === 'no') return 'not a bounce';
            return r.human;
        case 'connect.geoip':
            return r.human;
        case 'data.dmarc':
            var comment = (r.reason && r.reason.length) ?
                           r.reason[0].comment : '';
            return r.result === 'pass' ? r.result :
                    [ r.result, r.disposition, comment ].join(', ');
        case 'queue':
            // remove transaction suffix
            var bits = r.human.split(/\s+/);
            bits.pop();
            return bits.join(' ');
        default:
            return r.human_html;
    }
};

function get_local_port (connection) {
    if (!connection) return {
        classy: 'bg_white', newval: '25', title: 'disconnected'
    };
    var p = connection.local.port || '25';
    if (!p || isNaN(p)) return {
        classy: 'black', newval: '25', title: 'disconnected'
    };
    return {
        newval: p, classy: 'bg_dgreen', title: 'connected'
    };
}

function get_remote_host (connection) {
    var host  = connection.remote.host || '';
    var ip    = connection.remote.ip || '';
    var hostShort = host;

    if (host) {
        switch (host) {
            case 'DNSERROR':
            case 'Unknown':
                host = '';
                break;
        }
        if (host.length > 22) {
            hostShort = '...' + host.substring(host.length-20);
        }
    }

    return {
        newval: host ? (hostShort + ' / ' + ip) : ip,
        title: host ? (host + ' / ' + ip) : ip,
    };
}

function get_helo(connection) {
    var helo = connection.hello.host;
    if (!helo) return {};
    var r = {
        newval: helo.length > 22 ? '...'+helo.substring(helo.length -22) : helo,
        title:  helo,
    };
    if (connection.remote.host &&
        connection.remote.host.toLowerCase() === helo.toLowerCase()) {
        r.classy = 'green';  // matches rDNS
    }
    else {
        r.classy = 'red';  // matches rDNS
    }
    return r;
}

function get_mailfrom(txn) {
    if (!txn) return {};
    var addr = txn.mail_from.address();
    return {
        newval: (addr && addr.length > 22) ?
                ('..'+addr.substring(addr.length - 22)) : addr,
        classy: 'black',
        title:  addr,
    };
}

function get_recipients(txn) {

    var d = [];
    var t = [];
    txn.rcpt_to.forEach(function (ea) {
        try { var rcpt = ea.address(); }
        catch (ignore) { }
        if (!rcpt) {
            try { rcpt = ea.keys.join(','); }
            catch (ignore) { }
        }
        if (!rcpt) {
            rcpt = ea;
        }
        t.push(rcpt);
        d.push( (rcpt.length > 22) ?
                ('..'+rcpt.substring(rcpt.length - 22)) : rcpt );
    });
    return {
        newval: d.join(' \n'),
        classy: 'black',
        title: t.join(' \n'),
    };
}

function get_early (connection) {
    if (!connection) return;
    var early = connection.early_talker;
    return {
        title:  early ? 'yes' : 'no',
        classy: early ? 'bg_red' : 'bg_green',
    };
}

function get_tls (connection) {
    if (!connection.tls.enabled) return {};
    var tls = connection.notes.tls;
    if (!tls) { return { classy: 'bg_lgreen' }; }
    return {
        classy: tls.verified ? 'bg_green' : 'bg_lgreen',
        title: (!tls) ? '' : (!tls.cipher) ? '' :
               'ver=' + tls.cipher.version + ' cipher=' + tls.cipher.name,
    };
}

function get_relay (connection) {
    if (!connection.relaying) return { title: 'no'};
    return { title: 'yes', classy: 'bg_green'};
}
