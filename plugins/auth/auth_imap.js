// Auth against imap

var logger = require('./logger');
var imap;
try {
    imap = require('imap');
}
catch (e) {
    throw new Error('imap library not found, try \'npm -g install imap\' or \'npm install imap\' in your configuration directory to install it');
}

exports.register = function() {
    var plugin = this;

    if (!imap) {
        plugin.logerror('imap library not found, try \'npm -g install imap\' or \'npm install imap\' in your configuration directory to install it');
        return;
    }

    plugin.inherits('auth/auth_base');
    plugin.load_imap_ini();
};

exports.load_imap_ini = function() {
    var plugin = this;
    plugin.cfg = plugin.config.get('auth_imap.ini', function() {
        plugin.load_imap_ini();
    });
};

exports.hook_capabilities = function(next, connection) {
    // Don't offer AUTH capabilities by default unless session is encrypted
    if (connection.tls.enabled) {
        var methods = ['PLAIN', 'LOGIN'];
        connection.capabilities.push('AUTH ' + methods.join(' '));
        connection.notes.allowed_auth_methods = methods;
    }
    next();
};

exports.check_plain_passwd = function(connection, user, passwd, cb) {
    var plugin = this;
    var trace_imap = false;
    var config = {
        user: user,
        password: passwd,
        host: 'localhost',
        port: 143,
        tls: false
    };

    var domain = (user.split('@'))[1];
    var sect = plugin.cfg.main;
    var section_name = 'main';
    if (domain && plugin.cfg[domain]) {
        sect = plugin.cfg[domain];
        section_name = domain;
    }

    if (sect.trace_imap == 'true') {
        trace_imap = true;
        config.debug = function(info) {
            connection.logdebug(plugin, info);
        }
    }
    if (sect.host) {
        config.host = sect.host;
    }
    if (sect.port) {
        config.port = sect.port;
    }
    if (sect.tls) {
        config.tls = sect.tls;
    }
    if (sect.rejectUnauthorized) {
        config.tlsOptions = {
            rejectUnauthorized: sect.rejectUnauthorized
        };
    }
    if (sect.connTimeout) {
        config.connTimeout = sect.connTimeout;
    }
    if (sect.authTimeout) {
        config.authTimeout = sect.authTimeout;
    }

    if (sect.users) {
        if (sect.users.split(/\s*,\s*/).indexOf((user.split('@'))[0]) < 0) {
            connection.loginfo(plugin, 'AUTH user="' + user +
                '" is not allowed to authenticate by imap'
            );
            return cb(false);
        }
    }

    var client = new imap(config);

    var message = 'section="' + section_name + '" host="' +
        config.host + '" port="' + config.port + '" tls=' + config.tls;
    if (config.tlsOptions) {
        message += ' rejectUnauthorized=' + config.tlsOptions
            .rejectUnauthorized;
    }
    if (config.connTimeout) {
        message += ' connTimeout=' + config.connTimeout;
    }
    if (config.authTimeout) {
        message += ' authTimeout=' + config.authTimeout;
    }
    connection.logdebug(plugin, message);

    client.once('ready', function() {

        connection.loginfo(plugin, 'AUTH user="' + user +
            '" success=true');
        if (trace_imap) {
            connection.logdebug(plugin, client);
        }
        client.end();
        return cb(true);
    });

    client.once('error', function(err) {
        connection.loginfo(plugin, 'AUTH user="' + user +
            '" success=false error="' + err.message + '"');
        if (trace_imap) {
            connection.logdebug(plugin, client);
        }
        return cb(false);
    });

    client.connect();
};
