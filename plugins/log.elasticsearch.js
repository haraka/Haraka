'use strict';
// log to Elasticsearch

var utils = require('./utils');

exports.register = function() {
    var plugin = this;

    try {
        var elasticsearch = require('elasticsearch');
    }
    catch (err) {
        plugin.logerror(err);
        return;
    }

    plugin.load_es_ini();

    plugin.es = new elasticsearch.Client({
        hosts: plugin.cfg.es_hosts,
        // sniffOnStart: true,     // discover the rest of the ES nodes
        // sniffInterval: 300000,  // check every 5 min.
        // sniffOnConnectionFault: true,
        // log: 'trace',
    });

    plugin.es.ping({
        // ping usually has a 100ms timeout
        requestTimeout: 1000,

        // undocumented params are appended to the query string
        hello: "elasticsearch!"
    }, function (error) {
        if (error) {
            // we don't bother error handling hear b/c the ES library does
            // that for us.
            plugin.logerror('cluster is down!');
        }
        else {
            plugin.lognotice('connected');
        }
    });

    plugin.register_hook('reset_transaction', 'log_transaction');
    plugin.register_hook('disconnect',        'log_connection');
};

exports.load_es_ini = function () {
    var plugin = this;

    plugin.cfg = plugin.config.get('log.elasticsearch.ini', {
        booleans: [
            '+main.log_connections',
        ]
    },
    function () {
        plugin.load_es_ini();
    });

    plugin.get_es_hosts();

    if (plugin.cfg.ignore_hosts) {
        // convert bare entries (w/undef values) to true
        Object.keys(plugin.cfg.ignore_hosts).forEach(function (key) {
            if (plugin.cfg.ignore_hosts[key]) return;
            plugin.cfg.ignore_hosts[key]=true;
        });
    }

    plugin.cfg.headers = plugin.cfg.headers ?
        Object.keys(plugin.cfg.headers)     :
        ['From', 'To', 'Subject'];

    plugin.cfg.conn_props = plugin.cfg.connection_properties ||
        {   relaying:undefined,
            totalbytes:undefined,
            pipelining:undefined,
            early_talker:undefined,
        };
};

exports.get_es_hosts = function () {
    var plugin = this;
    if (!plugin.cfg.hosts) {   // no [hosts] config
        plugin.cfg.es_hosts = []; // default: http://localhost:9200
        return;
    }

    plugin.cfg.es_hosts = [];
    Object.keys(plugin.cfg.hosts).forEach(function (host) {
        if (!plugin.cfg.hosts[host]) {  // no options
            plugin.cfg.es_hosts.push({host: host});
            return;
        }

        var opts = { host: host };
        plugin.cfg.hosts[host].trim().split(',').forEach(function(opt){
            var o=opt.trim().split(':');
            opts[o[0]] = o[1];
        });

        plugin.cfg.es_hosts.push(opts);
    });
};

exports.log_transaction = function (next, connection) {
    var plugin = this;

    if (plugin.cfg.ignore_hosts) {
        if (plugin.cfg.ignore_hosts[connection.remote_host]) return next();
    }

    var res = plugin.get_plugin_results(connection);
    if (plugin.cfg.top_level_names && plugin.cfg.top_level_names.message) {
        res[plugin.cfg.top_level_names.message] = res.message;
        delete res.message;
    }
    res.timestamp = new Date().toISOString();

    plugin.populate_conn_properties(connection, res);
    plugin.es.create({
        index: exports.getIndexName('transaction'),
        type: 'haraka',
        id: connection.transaction.uuid,
        body: JSON.stringify(res),
    }, function (error, response) {
        if (error) {
            connection.logerror(plugin, error.message);
        }
        // connection.loginfo(plugin, response);
    });

    // hook reset_transaction doesn't seem to wait for next(). If I
    // wait until after I get a response back from ES, Haraka throws
    // "Error: We are already running hooks!". So, record that we've sent
    // to ES (so connection isn't saved) and hope for the best.
    connection.notes.elasticsearch=connection.tran_count;
    next();
};

exports.log_connection = function (next, connection) {
    var plugin = this;
    if (!plugin.cfg.main.log_connections) return next();

    if (plugin.cfg.ignore_hosts) {
        if (plugin.cfg.ignore_hosts[connection.remote_host]) return next();
    }

    if (connection.notes.elasticsearch &&
        connection.notes.elasticsearch === connection.tran_count) {
        connection.logdebug(plugin, 'skipping already logged txn');
        return next();
    }

    var res = plugin.get_plugin_results(connection);
    res.timestamp = new Date().toISOString();

    plugin.populate_conn_properties(connection, res);

    // connection.lognotice(plugin, JSON.stringify(res));
    plugin.es.create({
        index: exports.getIndexName('connection'),
        type: 'haraka',
        id: connection.uuid,
        body: JSON.stringify(res),
    }, function (error, response) {
        if (error) {
            connection.logerror(plugin, error.message);
        }
        // connection.loginfo(plugin, response);
    });
    next();
};

exports.objToArray = function (obj) {
    var arr = [];
    if (!obj || typeof obj !== 'object') return arr;
    Object.keys(obj).forEach(function (k) {
        arr.push({ k: k, v: obj[k] });
    });
    return arr;
};

exports.getIndexName = function (section) {
    var plugin = this;

    // Elasticsearch indexes named like: smtp-connection-2015-05-05
    //                                   smtp-transaction-2015-05-05
    var name = 'smtp-' + section;
    if (plugin.cfg.index && plugin.cfg.index[section]) {
        name = plugin.cfg.index[section];
    }
    var date = new Date();
    var d = date.getDate();
    var m = date.getMonth() + 1;
    return name +
           '-' + date.getFullYear() +
           '-' + (m <= 9 ? '0' + m : m) +
           '-' + (d <= 9 ? '0' + d : d);
};

exports.populate_conn_properties = function (conn, res) {
    var plugin = this;
    var conn_res = res;

    if (plugin.cfg.top_level_names && plugin.cfg.top_level_names.connection) {
        if (!res[plugin.cfg.top_level_names.connection]) {
            res[plugin.cfg.top_level_names.connection] = {};
        }
        conn_res = res[plugin.cfg.top_level_names.connection];
    }

    conn_res.local = {
        ip:   conn.local.ip,
        port: conn.local.port,
        host: plugin.cfg.hostname || require('os').hostname(),
    };
    conn_res.remote = {
        ip:   conn.remote.ip,
        host: conn.remote.host,
        port: conn.remote.port,
    };
    conn_res.hello = {
        host: conn.hello.host,
        verb: conn.hello.verb,
    };
    conn_res.tls = {
        enabled: conn.tls.enabled,
    };

    if (!conn_res.auth) {
        conn_res.auth = {};
        if (plugin.cfg.top_level_names && plugin.cfg.top_level_names.plugin) {
            var pia = plugin.cfg.top_level_names.plugin;
            if (res[pia] && res[pia].auth) {
                conn_res.auth = res[pia].auth;
                delete res[pia].auth;
            }
        }
        else {
            if (res.auth) {
                conn_res.auth = res.auth;
                delete res.auth;
            }
        }
    }

    conn_res.count = {
        errors: conn.errors,
        msg: conn.msg_count,
        rcpt: conn.rcpt_count,
        trans: conn.tran_count,
    };

    Object.keys(plugin.cfg.conn_props).forEach(function (f) {
        if (conn[f] === undefined) return;
        if (conn[f] === 0) return;
        if (plugin.cfg.conn_props[f]) {  // alias specified
            conn_res[plugin.cfg.conn_props[f]] = conn[f];
        }
        else {
            conn_res[f] = conn[f];
        }
    });

    conn_res.duration = (Date.now() - conn.start_time)/1000;
};

exports.get_plugin_results = function (connection) {
    var plugin = this;

    var name;
    // note that we make a copy of the result store, so subsequent changes
    // here don't alter the original (by reference)
    var pir = JSON.parse(JSON.stringify(connection.results.get_all()));
    for (name in pir) { plugin.trim_plugin_names(pir, name); }
    for (name in pir) {
        plugin.prune_noisy(pir, name);
        plugin.prune_empty(pir[name]);
        plugin.prune_zero(pir, name);
        plugin.prune_redundant_cxn(pir, name);
    }

    if (!connection.transaction) return plugin.nest_plugin_results(pir);

    try {
        var txr = JSON.parse(JSON.stringify(
                    connection.transaction.results.get_all()));
    }
    catch (e) {
        connection.transaction.results.add(plugin, {err: e.message });
        return plugin.nest_plugin_results(pir);
    }

    for (name in txr) { plugin.trim_plugin_names(txr, name); }
    for (name in txr) {
        plugin.prune_noisy(txr, name);
        plugin.prune_empty(txr[name]);
        plugin.prune_zero(txr, name);
        plugin.prune_redundant_txn(txr, name);
    }

    // merge transaction results into connection results
    for (name in txr) {
        if (!pir[name]) {
            pir[name] = txr[name];
        }
        else {
            utils.extend(pir[name], txr[name]);
        }
        delete txr[name];
    }

    plugin.populate_message(pir, connection);
    return plugin.nest_plugin_results(pir);
};

exports.populate_message = function (pir, connection) {
    var plugin = this;
    pir.message = {
        bytes: connection.transaction.data_bytes,
        envelope: {
            sender: '',
            recipient: [],
        },
        header: {},
        body: {
            attachment: [],
        },
        queue: {},
    };

    if (pir.mail_from && pir.mail_from.address) {
        pir.message.envelope.sender = pir.mail_from.address;
        delete pir.mail_from.address;
    }

    if (pir.rcpt_to && pir.rcpt_to.recipient) {
        pir.message.envelope.recipient = pir.rcpt_to.recipient;
        delete pir.rcpt_to;
    }

    if (pir.attachment && pir.attachment.attach) {
        pir.message.body.attachment = pir.attachment.attach;
        delete pir.attachment;
    }
    if (pir.queue) {
        pir.message.queue = pir.queue;
        delete pir.queue;
    }

    plugin.cfg.headers.forEach(function (h) {
        var r = connection.transaction.header.get_decoded(h);
        if (!r) return;
        pir.message.header[h] = r;
    });
};

exports.nest_plugin_results = function (res) {
    var plugin = this;
    if (!plugin.cfg.top_level_names) return res;
    if (!plugin.cfg.top_level_names.plugin) return res;

    var new_res = {};
    if (res.message) {
        new_res.message = res.message;
        delete res.message;
    }
    new_res[plugin.cfg.top_level_names.plugin] = res;
    return new_res;
};

exports.trimPluginName = function (name) {

    // for plugins named like: data.headers or connect.geoip, strip off the
    // phase prefix and return `headers` or `geoip`
    var parts = name.split('.');
    if (parts.length < 2) return name;

    switch (parts[0]) {
        case 'helo':
            return 'helo';
        case 'connect':
        case 'mail_from':
        case 'rcpt_to':
        case 'data':
            return parts.slice(1).join('.');
    }
    return name;
};

exports.trim_plugin_names = function (res, name) {
    var trimmed = exports.trimPluginName(name);
    if (trimmed === name) return;

    res[trimmed] = res[name];
    delete res[name];
    name = trimmed;
};

exports.prune_empty = function (pi) {

    // remove undefined keys and empty strings, arrays, or objects
    for (var e in pi) {
        var val = pi[e];
        if (val === undefined) {
            delete pi[e];
            continue;
        }

        if (typeof val === 'string') {
            if (val === '') {
                delete pi[e];
                continue;
            }
        }
        else if (Array.isArray(val)) {
            if (val.length === 0) {
                delete pi[e];
                continue;
            }
        }
        else if (typeof val === 'object') {
            if (Object.keys(val).length === 0) {
                delete pi[e];
                continue;
            }
        }
    }
};

exports.prune_noisy = function (res, pi) {
    var plugin = this;

    if (res[pi].human) { delete res[pi].human; }
    if (res[pi].human_html) { delete res[pi].human_html; }
    if (res[pi]._watch_saw) { delete res[pi]._watch_saw; }

    switch (pi) {
        case 'karma':
            delete res.karma.todo;
            delete res.karma.pass;
            delete res.karma.skip;
            break;
        case 'access':
            delete res.access.pass;
            break;
        case 'uribl':
            delete res.uribl.skip;
            delete res.uribl.pass;
            break;
        case 'dnsbl':
            delete res.dnsbl.pass;
            break;
        case 'fcrdns':
            var arr = plugin.objToArray(res.fcrdns.ptr_name_to_ip);
            res.fcrdns.ptr_name_to_ip = arr;
            break;
        case 'geoip':
            delete res.geoip.ll;
            break;
        case 'max_unrecognized_commands':
            res.unrecognized_commands =
                res.max_unrecognized_commands.count;
            delete res.max_unrecognized_commands;
            break;
        case 'spamassassin':
            delete res.spamassassin.line0;
            if (res.spamassassin.headers) {
                delete res.spamassassin.headers.Tests;
                delete res.spamassassin.headers.Level;
            }
    }
};

exports.prune_zero = function (res, name) {
    for (var e in res[name]) {
        if (res[name][e] !== 0) continue;
        delete res[name][e];
    }
};

exports.prune_redundant_cxn = function (res, name) {
    switch (name) {
        case 'helo':
            if (res.helo && res.helo.helo_host) {
                delete res.helo.helo_host;
            }
            break;
        case 'p0f':
            if (res.p0f && res.p0f.query) {
                delete res.p0f.query;
            }
            break;
    }
};

exports.prune_redundant_txn = function (res, name) {
    switch (name) {
        case 'spamassassin':
            if (!res.spamassassin) break;
            delete res.spamassassin.hits;
            if (!res.spamassassin.headers) break;
            if (!res.spamassassin.headers.Flag) break;
            delete res.spamassassin.headers.Flag;
            break;
    }
};

exports.put_map_template = function () {
    var plugin = this;
    var template_name = 'smtp';
    if (plugin.cfg.index && plugin.cfg.index.transaction) {
        template_name = plugin.cfg.index.transaction;
    }

    /* jshint maxlen: 100 */
    var body = {
        "dynamic_templates" : [
            // gone until docs for putTemplate are better
        ]
    };

    // https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/api-reference-1-3.html#api-puttemplate-1-3
    plugin.es.indices.putTemplate({
        id: 'haraka_results',
        template: template_name + '-*',
        type: 'haraka',
        body: body,
    });
};
