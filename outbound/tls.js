'use strict';

const logger       = require('../logger');
const tls_socket   = require('../tls_socket');
const hkredis      = require('haraka-plugin-redis');
const config       = require('haraka-config');

const inheritable_opts = [
    'key', 'cert', 'ciphers', 'dhparam',
    'requestCert', 'honorCipherOrder', 'rejectUnauthorized'
];

class OutboundTLS {
    constructor () {
        logger.add_log_methods(this);
        this.load_config();
    }

    load_config () {
        const tls_cfg = tls_socket.load_tls_ini({role: 'client'});
        const cfg = JSON.parse(JSON.stringify(tls_cfg.outbound || {}));
        cfg.redis = tls_cfg.redis; // Don't clone - contains methods

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
            cfg.key = config.get(cfg.key, 'binary');
        }

        if (cfg.dhparam) {
            cfg.dhparam = config.get(cfg.dhparam, 'binary');
        }

        if (cfg.cert) {
            if (Array.isArray(cfg.cert)) {
                cfg.cert = cfg.cert[0];
            }
            cfg.cert = config.get(cfg.cert, 'binary');
        }

        this.cfg = cfg;
    }

    init (cb) {
        // changing this var in-flight won't work
        if (this.cfg.redis && !this.cfg.redis.disable_for_failed_hosts) return cb();
        logger.logdebug(this, 'Will disable outbound TLS for failing TLS hosts');
        Object.assign(this, hkredis);
        this.merge_redis_ini();
        this.init_redis_plugin(cb);
    }

    get_tls_options (mx) {
        return Object.assign(this.cfg, {servername: mx.exchange});
    }

    // Check for if host is prohibited from TLS negotiation
    check_tls_nogo (host, cb_ok, cb_nogo) {
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
    }

    mark_tls_nogo (host, cb){
        const plugin = this;
        const dbkey = `no_tls|${host}`;
        const expiry = plugin.cfg.redis.disable_expiry || 604800;

        if (!plugin.cfg.redis.disable_for_failed_hosts)
            return cb();

        logger.lognotice(plugin, `TLS connection failed. Marking ${host} as non-TLS for ${expiry} seconds`);

        plugin.db.setex(dbkey, expiry, new Date(), (err, dbr) => {
            if (err) logger.logerror(plugin, `Redis returned error: ${err}`);

            cb();
        });
    }
}

// this is a singleton
module.exports = new OutboundTLS();
