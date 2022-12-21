'use strict';
// dnswl plugin

exports.register = function () {
    this.inherits('dns_list_base');

    this.load_dnswl_ini();

    // IMPORTANT: don't run this on hook_rcpt otherwise we're an open relay...
    ['ehlo','helo','mail'].forEach(hook => {
        this.register_hook(hook, 'check_dnswl');
    });
}

exports.load_dnswl_ini = function () {
    this.cfg = this.config.get('dnswl.ini', () => {
        this.load_dnswl_ini();
    });

    if (this.cfg.main.enable_stats) {
        this.logdebug('stats reporting enabled');
        this.enable_stats = true;
    }

    if (this.cfg.main.stats_redis_host) {
        this.redis_host = this.cfg.main.stats_redis_host;
        this.logdebug(`set stats redis host to: ${this.redis_host}`);
    }

    this.zones = [];
    // Compatibility with old-plugin
    this.zones = this.zones.concat(
        this.config.get('dnswl.zones', 'list')
    );
    if (this.cfg.main.zones) {
        this.zones = this.zones.concat(
            this.cfg.main.zones.replace(/\s+/g,'').split(/[;,]/));
    }

    if (this.cfg.main.periodic_checks) {
        this.check_zones(this.cfg.main.periodic_checks);
    }
}

exports.check_dnswl = (next, connection) => connection.notes.dnswl ? next(OK) : next()

exports.hook_connect = function (next, connection) {
    if (!this.zones || !this.zones.length) {
        connection.logerror(this, 'no zones');
        return next();
    }
    this.first(connection.remote.ip, this.zones, (err, zone, a) => {
        if (!a) return next();
        connection.loginfo(this, `${connection.remote.ip} is whitelisted by ${zone}: ${a}`);
        connection.notes.dnswl = true;
        return next(OK);
    });
}
