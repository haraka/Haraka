'use strict';

exports.name = 'outbound-tls';

exports.config     = require('haraka-config');

exports.tls_socket = require('../tls_socket');
const logger       = require('../logger');
const util = require('util');
const hkredis = require('haraka-plugin-redis');

// initialization routine, please call it early
exports.get_plugin_ready = function(cb) {
    let plugin = this;

    plugin.cfg = exports.load_config();
    // logger.logdebug(plugin, plugin.cfg.redis);

    if (plugin.cfg.redis.disable_for_failed_hosts) { // which means changing this var in-flight won't work
        logger.logdebug(plugin, 'Will disable outbound TLS for failing TLS hosts');
        Object.assign(plugin, hkredis);
        plugin.merge_redis_ini();
        plugin.init_redis_plugin(cb);
    }
};

exports.load_config = function() {
    const plugin = this;

    const tls_cfg = exports.tls_socket.load_tls_ini();
    const cfg = JSON.parse(JSON.stringify(tls_cfg.outbound || {}));
    cfg.redis = tls_cfg.redis;

    const inheritable_opts = [
        'key', 'cert', 'ciphers', 'dhparam',
        'requestCert', 'honorCipherOrder', 'rejectUnauthorized'
    ];

    for (const opt of inheritable_opts) {
        if (cfg[opt] === undefined) {
            // not declared in tls.ini[section]
            if (tls_cfg.main[opt] !== undefined) {
                // use value from [main] section
                cfg[opt] = tls_cfg.main[opt];
            }
        }
    }

    if (cfg.key) {
        if (Array.isArray(cfg.key)) {
            cfg.key = cfg.key[0];
        }
        cfg.key = exports.config.get(cfg.key, 'binary');
    }

    if (cfg.dhparam) {
        cfg.dhparam = exports.config.get(cfg.dhparam, 'binary');
    }

    if (cfg.cert) {
        if (Array.isArray(cfg.cert)) {
            cfg.cert = cfg.cert[0];
        }
        cfg.cert = exports.config.get(cfg.cert, 'binary');
    }

    return cfg;
};

exports.get_tls_options = function (mx) {
    return Object.assign(this.cfg, {servername: mx.exchange});
};

// Check for if host is prohibited from TLS negotiation
exports.check_tls_nogo = function(host, cb_ok, cb_nogo){
    const plugin = this;
    const dbkey = `no_tls|${host}`;

    if (!plugin.cfg.redis.disable_for_failed_hosts)
        return cb_ok();

    plugin.db.get(dbkey, (err, dbr) => {
        if (err) {
            logger.logdebug(plugin, `Redis returned error: ${err}`);
            return cb_ok();
        }

        return dbr ? cb_nogo(dbr) : cb_ok();
    });
};

exports.mark_tls_nogo = function(host, cb){
    var plugin = this;
    const dbkey = `no_tls|${host}`;
    var expiry = plugin.cfg.redis.disable_expiry || 604800;

    if (!plugin.cfg.redis.disable_for_failed_hosts)
        return cb();

    logger.lognotice(plugin, `TLS connection failed. Marking ${host} as non-TLS for ${expiry} seconds`);

    plugin.db.setex(dbkey, expiry, new Date(), (err, dbr) => {
        if (err) logger.logerror(plugin, `Redis returned error: ${err}`);

        cb();
    });
};

logger.add_log_methods(this);
