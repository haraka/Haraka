// send logs to syslog
var Syslog = require('node-syslog');

var done_syslog_init = false;

exports.hook_log = function (next, logger, log) {
    var options  = 0;
    var ini      = this.config.get('log.syslog.ini', 'ini');
    var name     = ini.general && (ini.general['name']       || 'haraka');
    var facility = ini.general && (ini.general['facility']   || 'MAIL');
    var pid      = ini.general && (ini.general['log_pid']    || 1);
    var odelay   = ini.general && (ini.general['log_odelay'] || 1);
    var cons     = ini.general && (ini.general['log_cons']   || 0);
    var ndelay   = ini.general && (ini.general['log_ndelay'] || 0);
    var nowait   = ini.general && (ini.general['log_nowait'] || 0);

    // We do not want to call Syslog.init(), and thus openlog(), every time
    // we log.  This should set our syslog connection up once, and then
    // reuse that connection.
    if (!(done_syslog_init)) {
        if (pid)
          options |= Syslog.LOG_PID;

        if (odelay)
          options |= Syslog.LOG_ODELAY;

        if (cons)
          options |= Syslog.LOG_CONS;

        if (ndelay)
          options |= Syslog.LOG_NDELAY;

        if (nowait)
          options |= Syslog.LOG_NOWAIT;

        switch(facility.toUpperCase()) {
            case 'MAIL':
                Syslog.init(name, options, Syslog.LOG_MAIL);
                done_syslog_init = true;
                break;
            case 'KERN':
                Syslog.init(name, options, Syslog.LOG_KERN);
                done_syslog_init = true;
                break;
            case 'USER':
                Syslog.init(name, options, Syslog.LOG_USER);
                done_syslog_init = true;
                break;
            case 'DAEMON':
                Syslog.init(name, options, Syslog.LOG_DAEMON);
                done_syslog_init = true;
                break;
            case 'AUTH':
                Syslog.init(name, options, Syslog.LOG_AUTH);
                done_syslog_init = true;
                break;
            case 'SYSLOG':
                Syslog.init(name, options, Syslog.LOG_SYSLOG);
                done_syslog_init = true;
                break;
            case 'LPR':
                Syslog.init(name, options, Syslog.LOG_LPR);
                done_syslog_init = true;
                break;
            case 'NEWS':
                Syslog.init(name, options, Syslog.LOG_NEWS);
                done_syslog_init = true;
                break;
            case 'UUCP':
                Syslog.init(name, options, Syslog.LOG_UUCP);
                done_syslog_init = true;
                break;
            case 'LOCAL0':
                Syslog.init(name, options, Syslog.LOG_LOCAL0);
                done_syslog_init = true;
                break;
            case 'LOCAL1':
                Syslog.init(name, options, Syslog.LOG_LOCAL1);
                done_syslog_init = true;
                break;
            case 'LOCAL2':
                Syslog.init(name, options, Syslog.LOG_LOCAL2);
                done_syslog_init = true;
                break;
            case 'LOCAL3':
                Syslog.init(name, options, Syslog.LOG_LOCAL3);
                done_syslog_init = true;
                break;
            case 'LOCAL4':
                Syslog.init(name, options, Syslog.LOG_LOCAL4);
                done_syslog_init = true;
                break;
            case 'LOCAL5':
                Syslog.init(name, options, Syslog.LOG_LOCAL5);
                done_syslog_init = true;
                break;
            case 'LOCAL6':
                Syslog.init(name, options, Syslog.LOG_LOCAL6);
                done_syslog_init = true;
                break;
            case 'LOCAL7':
                Syslog.init(name, options, Syslog.LOG_LOCAL7);
                done_syslog_init = true;
                break;
            default:
                Syslog.init(name, options, Syslog.LOG_MAIL);
                done_syslog_init = true;
        }
    }

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

    return next();
}
