// send logs to syslog

exports.register = function() {
    var plugin = this;

    try { plugin.Syslog = require('node-syslog'); }
    catch (e) {
        plugin.logerror("unable to load node-syslog, plugin disabled\n" +
                "try: npm install node-syslog" );
        return;
    }

    var options   = 0;
    var ini       = plugin.config.get('log.syslog.ini');
    ini.general   = ini.general               || {};
    var name      = ini.general.name       || 'haraka';
    var facility  = ini.general.facility   || 'MAIL';
    var pid       = ini.general.log_pid    || 1;
    var odelay    = ini.general.log_odelay || 1;
    var cons      = ini.general.log_cons   || 0;
    var ndelay    = ini.general.log_ndelay || 0;
    var nowait    = ini.general.log_nowait || 0;
    var always_ok = ini.general.always_ok  || false;

    if (always_ok && (always_ok >= 1 || always_ok.toLowerCase() === 'true')) {
        always_ok = true;
    }
    else {
        always_ok = false;
    }

    plugin.always_ok = always_ok;

    if (pid && (pid >= 1 || pid.toLowerCase() === 'true')) {
        options |= plugin.Syslog.LOG_PID;
    }

    if (odelay && (odelay >= 1 || odelay.toLowerCase() === 'true')) {
        options |= plugin.Syslog.LOG_ODELAY;
    }

    if (cons && (cons >= 1 || cons.toLowerCase() === 'true')) {
        options |= plugin.Syslog.LOG_CONS;
    }

    if (ndelay && (ndelay >= 1 || ndelay.toLowerCase() === 'true')) {
        options |= plugin.Syslog.LOG_NDELAY;
    }

    if (nowait && (nowait >= 1 || nowait.toLowerCase() === 'true')) {
        options |= plugin.Syslog.LOG_NOWAIT;
    }

    switch(facility.toUpperCase()) {
        case 'MAIL':
            plugin.Syslog.init(name, options, plugin.Syslog.LOG_MAIL);
            break;
        case 'KERN':
            plugin.Syslog.init(name, options, plugin.Syslog.LOG_KERN);
            break;
        case 'USER':
            plugin.Syslog.init(name, options, plugin.Syslog.LOG_USER);
            break;
        case 'DAEMON':
            plugin.Syslog.init(name, options, plugin.Syslog.LOG_DAEMON);
            break;
        case 'AUTH':
            plugin.Syslog.init(name, options, plugin.Syslog.LOG_AUTH);
            break;
        case 'SYSLOG':
            plugin.Syslog.init(name, options, plugin.Syslog.LOG_SYSLOG);
            break;
        case 'LPR':
            plugin.Syslog.init(name, options, plugin.Syslog.LOG_LPR);
            break;
        case 'NEWS':
            plugin.Syslog.init(name, options, plugin.Syslog.LOG_NEWS);
            break;
        case 'UUCP':
            plugin.Syslog.init(name, options, plugin.Syslog.LOG_UUCP);
            break;
        case 'LOCAL0':
            plugin.Syslog.init(name, options, plugin.Syslog.LOG_LOCAL0);
            break;
        case 'LOCAL1':
            plugin.Syslog.init(name, options, plugin.Syslog.LOG_LOCAL1);
            break;
        case 'LOCAL2':
            plugin.Syslog.init(name, options, plugin.Syslog.LOG_LOCAL2);
            break;
        case 'LOCAL3':
            plugin.Syslog.init(name, options, plugin.Syslog.LOG_LOCAL3);
            break;
        case 'LOCAL4':
            plugin.Syslog.init(name, options, plugin.Syslog.LOG_LOCAL4);
            break;
        case 'LOCAL5':
            plugin.Syslog.init(name, options, plugin.Syslog.LOG_LOCAL5);
            break;
        case 'LOCAL6':
            plugin.Syslog.init(name, options, plugin.Syslog.LOG_LOCAL6);
            break;
        case 'LOCAL7':
            plugin.Syslog.init(name, options, plugin.Syslog.LOG_LOCAL7);
            break;
        default:
            plugin.Syslog.init(name, options, plugin.Syslog.LOG_MAIL);
    }

    plugin.register_hook('log', 'syslog');
};

exports.syslog = function (next, logger, log) {
    var plugin = this;

    switch(log.level.toUpperCase()) {
        case 'INFO':
            plugin.Syslog.log(plugin.Syslog.LOG_INFO, log.data);
            break;
        case 'NOTICE':
            plugin.Syslog.log(plugin.Syslog.LOG_NOTICE, log.data);
            break;
        case 'WARN':
            plugin.Syslog.log(plugin.Syslog.LOG_WARNING, log.data);
            break;
        case 'ERROR':
            plugin.Syslog.log(plugin.Syslog.LOG_ERR, log.data);
            break;
        case 'CRIT':
            plugin.Syslog.log(plugin.Syslog.LOG_CRIT, log.data);
            break;
        case 'ALERT':
            plugin.Syslog.log(plugin.Syslog.LOG_ALERT, log.data);
            break;
        case 'EMERG':
            plugin.Syslog.log(plugin.Syslog.LOG_EMERG, log.data);
            break;
        case 'DATA':
        case 'PROTOCOL':
        case 'DEBUG':
        default:
            plugin.Syslog.log(plugin.Syslog.LOG_DEBUG, log.data);
    }

    if (plugin.always_ok) {
        return next(OK);
    }
    return next();
};
