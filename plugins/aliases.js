// This is the aliases plugin
// One must not run this plugin with the queue/smtp_proxy plugin.
var Address = require('./address').Address;

exports.register = function () {
    this.inherits('queue/discard');

    this.register_hook('rcpt','aliases');
};

exports.aliases = function (next, connection, params) {
    var plugin = this;
    var config = this.config.get('aliases', 'json') || {};
    var rcpt   = params[0].address();
    var user   = params[0].user;
    var host   = params[0].host;
    var match  = user.split("-", 1);
    var action = "<missing>";

    if (config[user] || config[match[0]]) {
        if (config[user]) {
            action = config[user].action || action;
            match  = user;
        }
        else {
            action = config[match[0]].action || action;
            match  = match[0];
        }

        switch (action.toLowerCase()) {
          case 'drop':
              _drop(plugin, connection, rcpt);
              break;
          case 'alias':
              _alias(plugin, connection, match, config[match], host);
              break;
          default:
             connection.loginfo(plugin, "unknown action: " + action);
        }
    }

    next();
};

function _drop(plugin, connection, rcpt) {
    connection.logdebug(plugin, "marking " + rcpt + " for drop");
    connection.transaction.notes.discard = true;
}

function _alias(plugin, connection, key, config, host) {
    var to;
    var toAddress;

    if (config.to) {
        if (config.to.search("@") !== -1) {
            to = config.to;
        }
        else {
            to = config.to + '@' + host;
        }

        connection.logdebug(plugin, "aliasing " +
            connection.transaction.rcpt_to + " to " + to);

        toAddress = new Address('<' + to + '>');
        connection.transaction.rcpt_to.pop();
        connection.transaction.rcpt_to.push(toAddress);
    }
    else {
        connection.loginfo(plugin, 'alias failed for ' + key +
            ', no "to" field in alias config');
    }
}
