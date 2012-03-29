// send logs to syslog
var Syslog = exports.Syslog = require('node-syslog');

exports.register = function() {
    var options   = 0;
    var ini       = this.config.get('log.syslog.ini');
    ini.general   = ini.general               || {};
    var name      = ini.general['name']       || 'haraka';
    var facility  = ini.general['facility']   || 'MAIL';
    var pid       = ini.general['log_pid']    || 1;
    var odelay    = ini.general['log_odelay'] || 1;
    var cons      = ini.general['log_cons']   || 0;
    var ndelay    = ini.general['log_ndelay'] || 0;
    var nowait    = ini.general['log_nowait'] || 0;
    var always_ok = ini.general['always_ok']  || false;

    if (always_ok && (always_ok >= 1 || always_ok.toLowerCase() === 'true')) {
        always_ok = true;
    }
    else {
        always_ok = false;
    }

    this.always_ok = always_ok;

    if (pid && (pid >= 1 || pid.toLowerCase() === 'true')) {
        options |= Syslog.LOG_PID;
    }

    if (odelay && (odelay >= 1 || odelay.toLowerCase() === 'true')) {
        options |= Syslog.LOG_ODELAY;
    }

    if (cons && (cons >= 1 || cons.toLowerCase() === 'true')) {
        options |= Syslog.LOG_CONS;
    }

    if (ndelay && (ndelay >= 1 || ndelay.toLowerCase() === 'true')) {
        options |= Syslog.LOG_NDELAY;
    }

    if (nowait && (nowait >= 1 || nowait.toLowerCase() === 'true')) {
        options |= Syslog.LOG_NOWAIT;
    }

    switch(facility.toUpperCase()) {
        case 'MAIL':
            Syslog.init(name, options, Syslog.LOG_MAIL);
            break;
        case 'KERN':
            Syslog.init(name, options, Syslog.LOG_KERN);
            break;
        case 'USER':
            Syslog.init(name, options, Syslog.LOG_USER);
            break;
        case 'DAEMON':
            Syslog.init(name, options, Syslog.LOG_DAEMON);
            break;
        case 'AUTH':
            Syslog.init(name, options, Syslog.LOG_AUTH);
            break;
        case 'SYSLOG':
            Syslog.init(name, options, Syslog.LOG_SYSLOG);
            break;
        case 'LPR':
            Syslog.init(name, options, Syslog.LOG_LPR);
            break;
        case 'NEWS':
            Syslog.init(name, options, Syslog.LOG_NEWS);
            break;
        case 'UUCP':
            Syslog.init(name, options, Syslog.LOG_UUCP);
            break;
        case 'LOCAL0':
            Syslog.init(name, options, Syslog.LOG_LOCAL0);
            break;
        case 'LOCAL1':
            Syslog.init(name, options, Syslog.LOG_LOCAL1);
            break;
        case 'LOCAL2':
            Syslog.init(name, options, Syslog.LOG_LOCAL2);
            break;
        case 'LOCAL3':
            Syslog.init(name, options, Syslog.LOG_LOCAL3);
            break;
        case 'LOCAL4':
            Syslog.init(name, options, Syslog.LOG_LOCAL4);
            break;
        case 'LOCAL5':
            Syslog.init(name, options, Syslog.LOG_LOCAL5);
            break;
        case 'LOCAL6':
            Syslog.init(name, options, Syslog.LOG_LOCAL6);
            break;
        case 'LOCAL7':
            Syslog.init(name, options, Syslog.LOG_LOCAL7);
            break;
        default:
            Syslog.init(name, options, Syslog.LOG_MAIL);
    }

    this.register_hook('log', 'syslog');
};

exports.syslog = function (next, logger, log) {
    var plugin = this;

    switch(log.level.toUpperCase()) {
        case 'INFO':
            Syslog.log(Syslog.LOG_INFO, log.data);
            break;
        case 'NOTICE':
            Syslog.log(Syslog.LOG_NOTICE, log.data);
            break;
        case 'WARN':
            Syslog.log(Syslog.LOG_WARNING, log.data);
            break;
        case 'ERROR':
            Syslog.log(Syslog.LOG_ERR, log.data);
            break;
        case 'CRIT':
            Syslog.log(Syslog.LOG_CRIT, log.data);
            break;
        case 'ALERT':
            Syslog.log(Syslog.LOG_ALERT, log.data);
            break;
        case 'EMERG':
            Syslog.log(Syslog.LOG_EMERG, log.data);
            break;
        case 'DATA':
        case 'PROTOCOL':
        case 'DEBUG':
        default:
            Syslog.log(Syslog.LOG_DEBUG, log.data);
    }

    if (plugin.always_ok) {
        return next(OK);
    }
    else {
        return next();
    }
};
