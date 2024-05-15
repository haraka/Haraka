// This plugin checks for clients that talk before we sent a response

const { isIPv6 } = require('node:net');

const ipaddr = require('ipaddr.js');

exports.register = function () {
    this.load_config();
    this.register_hook('connect_init', 'early_talker');
    this.register_hook('data',         'early_talker');
}

exports.load_config = function () {

    this.cfg = this.config.get('early_talker.ini', {
        booleans: [
            '+main.reject'
        ]
    },
    () => {
        this.load_config();
    });

    // Generate a white list of IP addresses
    this.whitelist = this.load_ip_list(Object.keys(this.cfg.ip_whitelist));

    if (this.cfg.main?.pause) {
        this.pause = this.cfg.main.pause * 1000;
        return;
    }

    // config/early_talker.pause is in milliseconds
    this.pause = this.config.get('early_talker.pause', () => {
        this.load_config();
    });
}

exports.early_talker = function (next, connection) {
    const plugin = this;
    if (!plugin.pause) return next();
    if (!plugin.should_check(connection)) return next();

    function check () {
        if (!connection) return next();
        if (!connection.early_talker) {
            connection.results.add(plugin, {pass: 'early'});
            return next();
        }
        connection.results.add(plugin, {fail: 'early'});
        if (!plugin.cfg.main.reject) return next();
        return next(DENYDISCONNECT, "You talk too soon");
    }

    let { pause } = plugin;
    if (plugin.hook === 'connect_init') {
        const elapsed = (Date.now() - connection.start_time);
        if (elapsed > plugin.pause) {
            // Something else already waited
            return check();
        }
        pause = plugin.pause - elapsed;
    }

    setTimeout(() => { check(); }, pause);
}


/**
 * Check if an ip is whitelisted
 *
 * @param  {String} ip       The remote IP to verify
 * @return {Boolean}         True if is whitelisted
 */
exports.ip_in_list = function (ip) {

    if (!this.whitelist) return false;

    const ipobj = ipaddr.parse(ip);

    for (const element of this.whitelist) {
        try {
            if (ipobj.match(element)) {
                return true;
            }
        }
        catch (ignore) {
        }
    }
    return false;
}


/**
 * Convert config ip to ipaddr objects
 *
 * @param  {Array} list A list of IP addresses / subnets
 * @return {Array}      The converted array
 */
exports.load_ip_list = list => {
    const whitelist = [];

    for (const element of list) {
        try {
            let addr = element;
            if (addr.match(/\/\d+$/)) {
                addr = ipaddr.parseCIDR(addr);
            }
            else {
                addr = ipaddr.parseCIDR(addr + ((isIPv6(addr)) ? '/128' : '/32'));
            }

            whitelist.push(addr);
        }
        catch (ignore) {
        }
    }
    return whitelist;
}

exports.should_check = function (connection) {
    // Skip delays for privileged senders

    if (connection.notes.auth_user) {
        connection.results.add(this, { skip: 'authed'});
        return false;
    }

    if (connection.relaying) {
        connection.results.add(this, { skip: 'relay'});
        return false;
    }

    if (this.ip_in_list(connection.remote.ip)) {
        connection.results.add(this, { skip: 'whitelist' });
        return false;
    }

    const karma = connection.results.get('karma');
    if (karma && karma.good > 0) {
        connection.results.add(this, { skip: '+karma' });
        return false;
    }

    if (connection.remote.is_local) {
        connection.results.add(this, { skip: 'local_ip'});
        return false;
    }

    if (connection.remote.is_private) {
        connection.results.add(this, { skip: 'private_ip'});
        return false;
    }

    return true;
}
