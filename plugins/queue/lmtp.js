"use strict";

var outbound = require('./outbound');

//Should be changed to config lookup 
var lmtp_domain = 'laptop-workstation';
var lmtp_server_address = '127.0.0.1';
var lmtp_server_port = "24"

//get_mx hook
exports.hook_get_mx = function (next, hmail, domain) {
    if (domain == lmtp_domain) {
        next(OK, [{priority:0, exchange:lmtp_server_address, port:lmtp_server_port, isLMTP:true}]);
    }
    else {
        next(CONT);
    }
}

exports.hook_queue = function (next, connection) {
    outbound.send_email(connection.transaction, next);
}
