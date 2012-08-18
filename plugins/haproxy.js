// haproxy plugin
// Consumes HAProxy's PROXY protocol

var net = require('net');

exports.hook_proxy = function (next, connection, line) {
    // Parse the remainder of the line
    var match;
    if (!(match = /^(TCP4|TCP6|UNKNOWN) (\S+) (\S+) (\d+) (\d+)$/.exec(line))) {
        return next(DENYDISCONNECT, 'Invalid PROXY format'); 
    }
    else {
        var proto = match[1];
        var src_ip = match[2];
        var dst_ip = match[3];
        var src_port = match[4];
        var dst_port = match[5];

        // Validate source/destination IP
        switch (proto) {
            case 'TCP4':
                if (net.isIPv4(src_ip) && net.isIPv4(dst_ip)) {
                    break;
                }
            case 'TCP6':
                if (net.isIPv6(src_ip) && net.isIPv6(dst_ip)) {
                    break;
                }
            case 'UNKNOWN':
            default:
                return next(DENYDISCONNECT, 'Invalid PROXY format');
        }

        // Apply changes
        connection.loginfo(this,  
            'src_ip=' + src_ip + ':' + src_port +
            ' dst_ip=' + dst_ip + ':' + dst_port);
        connection.reset_transaction();
        connection.relaying = false;
        connection.remote_ip = src_ip;
        connection.remote_host = undefined;
        connection.hello_host = undefined;
        return next(OK);
    }    
}
