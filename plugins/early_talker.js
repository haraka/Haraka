// This plugin checks for clients that talk before we sent a response

var ipaddr = require('ipaddr.js');
var isIPv6 = require('net').isIPv6;

exports.register = function() {
    var plugin = this;
    plugin.load_config();
    plugin.register_hook('connect_init', 'early_talker');
    plugin.register_hook('data',         'early_talker');
};

exports.load_config = function () {
    var plugin = this;

    plugin.cfg = plugin.config.get('early_talker.ini', {
        booleans: [
            '+main.reject'
        ]
    },
    function () {
        plugin.load_config();
    });

    // Generate a white list of IP addresses
    plugin.whitelist = plugin.load_ip_list(Object.keys(plugin.cfg.ip_whitelist));

    if (plugin.cfg.main && plugin.cfg.main.pause) {
        plugin.pause = plugin.cfg.main.pause * 1000;
        return;
    }

    // config/early_talker.pause is in milliseconds
    plugin.pause = plugin.config.get('early_talker.pause', function () {
        plugin.load_config();
    });
};

exports.early_talker = function(next, connection) {
    var plugin = this;
    if (!plugin.pause) return next();

    if (connection.relaying) {    // Don't delay AUTH/RELAY clients
        if (connection.early_talker) {
            connection.results.add(plugin, { skip: 'relay client'});
        }
        return next();
    }

    // Don't delay whitelisted IPs
    if (plugin.ip_in_list(connection.remote.ip)) { // check connecting IP
        connection.results.add(plugin, { skip: 'whitelist' });
        return next();
    }

    var check = function () {
        if (!connection) return next();
        if (!connection.early_talker) {
            connection.results.add(plugin, {pass: 'early'});
            return next();
        }
        connection.results.add(plugin, {fail: 'early'});
        if (!plugin.cfg.main.reject) return next();
        return next(DENYDISCONNECT, "You talk too soon");
    };

    var pause = plugin.pause;
    if (plugin.hook === 'connect_init') {
        var elapsed = (Date.now() - connection.start_time);
        if (elapsed > plugin.pause) {
            // Something else already waited
            return check();
        }
        pause = plugin.pause - elapsed;
    }

    setTimeout(function () { check(); }, pause);
};


/**
 * Check if an ip is whitelisted
 *
 * @param  {String} ip       The remote IP to verify
 * @return {Boolean}         True if is whitelisted
 */
exports.ip_in_list = function (ip) {
    var plugin = this;

    if (!plugin.whitelist) {
        return false;
    }

    var ipobj = ipaddr.parse(ip);

    for (var i = 0; i < plugin.whitelist.length; i++) {
        try {
            if (ipobj.match(plugin.whitelist[i])) {
                return true;
            }
        } catch (ignore) {
        }
    }
    return false;
};


/**
 * Convert config ip to ipaddr objects
 *
 * @param  {Array} list A list of IP addresses / subnets
 * @return {Array}      The converted array
 */
exports.load_ip_list = function(list) {
    var whitelist = [];

    for (var i = 0; i < list.length; i++) {
        try {
            var addr = list[i];
            if (addr.match(/\/\d+$/)) {
                addr = ipaddr.parseCIDR(addr);
            }
            else {
                addr = ipaddr.parseCIDR(addr + ((isIPv6(addr)) ? '/128' : '/32'));
            }

            whitelist.push(addr);
        } catch (ignore) {
        }
    }
    return whitelist;
};
