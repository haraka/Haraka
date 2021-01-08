'use strict'

const config = module.exports = require('haraka-config');
const logger = require('./logger');

exports.load_smtp_ini = () => {

    const cfg = config.get('smtp.ini', {
        booleans: [
            '-main.daemonize',
            '-main.strict_rfc1869',
            '+main.smtputf8',
            '-main.graceful_shutdown',
            '+headers.add_received',
            '+headers.show_version',
            '+headers.clean_auth_results',
        ],
    }, () => {
        this.load_smtp_ini();
    });

    if (cfg.main.nodes === undefined) {
        logger.logwarn(`smtp.ini.nodes unset, using 1, see https://github.com/haraka/Haraka/wiki/Performance-Tuning`)
    }

    const defaults = {
        inactivity_timeout: 300,
        daemon_log_file: '/var/log/haraka.log',
        daemon_pid_file: '/var/run/haraka.pid',
        force_shutdown_timeout: 30,
        smtps_port: 465,
        nodes: 1,
    };

    cfg.headers.max_received = parseInt(cfg.headers.max_received) || parseInt(config.get('max_received_count')) || 100;
    cfg.headers.max_lines    = parseInt(cfg.headers.max_lines) || parseInt(config.get('max_header_lines')) || 1000;

    const strict_ext = config.get('strict_rfc1869');
    if (cfg.main.strict_rfc1869 === false && strict_ext) {
        logger.logwarn(`legacy config config/strict_rfc1869 is overriding smtp.ini`)
        cfg.main.strict_rfc1869 = strict_ext;
    }

    const hhv = config.get('header_hide_version')  // backwards compat
    if (hhv !== null && !hhv) cfg.headers.show_version = false;

    for (const key in defaults) {
        if (cfg.main[key] !== undefined) continue;
        cfg.main[key] = defaults[key];
    }
    return cfg;
}

exports.load_http_ini = () => {

    const cfg = config.get('http.ini', () => {
        this.load_http_ini();
    });

    return cfg;
}
