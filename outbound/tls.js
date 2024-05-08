'use strict';

const net          = require('node:net')

const config       = require('haraka-config');
const hkredis      = require('haraka-plugin-redis');

const logger       = require('../logger');
const tls_socket   = require('../tls_socket');

const inheritable_opts = [
    'key', 'cert', 'ciphers', 'minVersion', 'dhparam',
    'requestCert', 'honorCipherOrder', 'rejectUnauthorized',
    'force_tls_hosts'
];

class OutboundTLS {
    constructor () {
        this.config = config;
        this.name = 'OutboundTLS';
        logger.add_log_methods(this);
    }

    test_config (tls_config, our_config) {
        tls_socket.config = tls_config;
        this.config = our_config;
    }

    load_config () {
        const tls_cfg = tls_socket.load_tls_ini({role: 'client'});
        const cfg = JSON.parse(JSON.stringify(tls_cfg.outbound || {}));
        cfg.redis = tls_cfg.redis; // Don't clone - contains methods

        for (const opt of inheritable_opts) {
            if (cfg[opt] !== undefined) continue;          // option set in [outbound]
            if (tls_cfg.main[opt] === undefined) continue; // opt unset in tls.ini[main]
            cfg[opt] = tls_cfg.main[opt];                  // use value from [main] section
        }

        if (cfg.key) {
            if (Array.isArray(cfg.key)) {
                cfg.key = cfg.key[0];
            }
            cfg.key = this.config.get(cfg.key, 'binary');
        }

        if (cfg.dhparam) {
            cfg.dhparam = this.config.get(cfg.dhparam, 'binary');
        }

        if (cfg.cert) {
            if (Array.isArray(cfg.cert)) {
                cfg.cert = cfg.cert[0];
            }
            cfg.cert = this.config.get(cfg.cert, 'binary');
        }

        if (!cfg.no_tls_hosts) cfg.no_tls_hosts = [];
        if (!cfg.force_tls_hosts) cfg.force_tls_hosts = [];

        this.cfg = cfg;
    }

    init (cb) {
        this.load_config();
        // changing this var in-flight won't work
        if (this.cfg.redis && !this.cfg.redis.disable_for_failed_hosts) return cb();
        logger.debug(this, 'Will disable outbound TLS for failing TLS hosts');
        Object.assign(this, hkredis);
        this.merge_redis_ini();
        this.init_redis_plugin(cb);
    }

    get_tls_options (mx) {
        // do NOT set servername to an IP address
        if (net.isIP(mx.exchange)) {
            // when mx.exchange looked up in DNS, from_dns has the hostname
            if (mx.from_dns) return { ...this.cfg, servername: mx.from_dns }
            return { ...this.cfg }
        }
        else {
            // mx.exchange is a hostname
            return { ...this.cfg, servername: mx.exchange }
        }
    }

    // Check for if host is prohibited from TLS negotiation
    check_tls_nogo (host, cb_ok, cb_nogo) {
        if (!this.cfg.redis.disable_for_failed_hosts) return cb_ok();

        const dbkey = `no_tls|${host}`;
        this.db.get(dbkey)
            .then(dbr => {
                dbr ? cb_nogo(dbr) : cb_ok();
            })
            .catch(err => {
                logger.debug(this, `Redis returned error: ${err}`);
                cb_ok();
            })
    }

    mark_tls_nogo (host, cb) {
        const dbkey = `no_tls|${host}`;
        const expiry = this.cfg.redis.disable_expiry || 604800;

        if (!this.cfg.redis.disable_for_failed_hosts) return cb();

        logger.notice(this, `TLS connection failed. Marking ${host} as non-TLS for ${expiry} seconds`);

        this.db.setEx(dbkey, expiry, (new Date()).toISOString())
            .then(cb)
            .catch(err => {
                logger.error(this, `Redis returned error: ${err}`);
            })
    }
}

// this is a singleton
module.exports = new OutboundTLS();
