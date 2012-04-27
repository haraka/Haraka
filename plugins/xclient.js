// Implementation of XCLIENT protocol
// See http://www.postfix.org/XCLIENT_README.html

var utils = require('./utils');
var DSN = require('./dsn');
var net = require('net');

exports.hook_capabilities = function (next, connection) {
    connection.capabilities.push('XCLIENT NAME ADDR PROTO HELO');
    next();
};

exports.hook_unrecognized_command = function (next, connection, params) {
    if (params[0] !== 'XCLIENT') {
        return next();
    }

    // XCLIENT is not allowed after transaction start
    if (connection.transaction) {
        return next(DENY, DSN.proto_unspecified('Mail transaction in progress', 503));
    }

    // Check that the client is authorized
    var config = this.config.get('xclient.hosts','list');
    var found;
    for (var i in config) {
        connection.logdebug(this, 'Checking ' + connection.remote_ip + ' == ' + config[i]);
        // TODO: handle ip/mask here.
        if (connection.remote_ip === config[i]) {
            found = true;
            break;
        }
    }
    if (!found) {
        return next(DENY, DSN.proto_unspecified('Not authorized', 550));
    }

    // If we get here - the client is allowed to use XCLIENT
    // Process arguments
    var args = (new String(params[1])).toLowerCase().split(/ /);
    var xclient = {};
    for (var a=0; a < args.length; a++) {
        var match = /^([^=]+)=([^ ]+)/.exec(args[a]);
        if (match) {
            connection.logdebug(this, 'found key=' + match[1] + ' value=' + match[2]);
            switch(match[1]) {
                case 'addr':
                    // IPv6 is prefixed in the XCLIENT protocol
                    var ipv6;
                    if ((ipv6 = /^IPV6:(.+)$/i.exec(match[2]))) {
                        // Validate
                        if (net.isIPv6(ipv6[1])) {
                            xclient[match[1]] = ipv6[1];
                        }
                    }
                    else if (!/\[UNAVAILABLE\]/i.test(match[2])) {
                        // IPv4
                        if (net.isIPv4(match[2])) {
                            xclient[match[1]] = match[2];
                        }
                    }
                    break;
                case 'proto':
                    // SMTP or ESMTP
                    if (/^e?smtp/i.test(match[2])) {
                        xclient[match[1]] = match[2];
                    } 
                    break;
                case 'name':
                case 'port':
                case 'helo':
                    if (!/\[(UNAVAILABLE|TEMPUNAVAIL)\]/i.test(match[2])) {
                        xclient[match[1]] = match[2];
                    }
                    break;
                default:
                    connection.logwarn(this, 'unknown argument: ' + args[a]);
            }
        } 
        else {
            connection.logwarn(this, 'unknown argument: ' + args[a]);
        }
    }

    // Abort if we don't have a valid IP address
    if (!xclient.addr) {
        return next(DENY, DSN.proto_invalid_cmd_args('No valid IP address found', 501));
    }

    // Apply changes
    var new_uuid = utils.uuid();
    connection.loginfo(this, 'new uuid=' + new_uuid);
    connection.uuid = new_uuid;
    connection.reset_transaction();
    connection.relaying = false;
    connection.remote_ip = xclient.addr;
    connection.remote_host = (xclient.name) ? xclient.name : undefined;
    connection.hello_host = (xclient.helo) ? xclient.helo : undefined;
    if (xclient.proto) {
        connection.greeting = (xclient.proto === 'esmtp') ? 'EHLO' : 'HELO';
    }
    connection.esmtp = (xclient.proto === 'esmtp') ? true : false;
    connection.xclient = true;
    if (!xclient.name) {
        return next(NEXT_HOOK, 'lookup_rdns');
    }
    else {
        return next(NEXT_HOOK, 'connect');
    }
};
