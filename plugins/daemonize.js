// daemonize 

// This plugin should not be used any more
// Daemonization is now built-in to Haraka.

throw new Error('The daemonize plugin should not be used.' +
               ' See haraka -h CoreConfig for details');

// npm install daemon
var daemon;
try { daemon = require('daemon'); }
catch (err) {};

var cfg;
exports.register = function () {
    cfg = this.config.get('daemonize.ini');
}

exports.hook_init_master = function (next) {
    if (!daemon) {
        this.lognotice('daemon library not found, run \'npm install daemon\' in your configuration directory to install it');
        return next();
    }
    var log = (cfg.main.log_file) 
        ? cfg.main.log_file : '/var/log/haraka.log';
    var pid = (cfg.main.pid_file) 
        ? cfg.main.pid_file : '/var/run/haraka.pid';
    var self = this;
    daemon.daemonize(log, pid, function (err, pid) {
        if (err) {
            self.logcrit('error starting daemon: ' + err);
            return next(DENY, err);
        }
        self.lognotice('daemon started with pid: ' + pid);
        return next();
    });
}
