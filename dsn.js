"use strict";
// RFC 3463 Enhanced Status Codes
var enum_status_codes = [
    [   // X.0.XXX Other or Undefined Status        (unspecified)
        "Other undefined status",                                   // X.0.0
    ],
    [   // X.1.XXX Addressing Status                (addr_*)
        "Other address status",                                     // X.1.0
        "Bad destination mailbox address",                          // X.1.1
        "Bad destination system address",                           // X.1.2
        "Bad destination mailbox address syntax",                   // X.1.3
        "Destination mailbox address ambiguous",                    // X.1.4
        "Destination address valid",                                // X.1.5
        "Destination mailbox has moved, No forwarding address",     // X.1.6
        "Bad sender's mailbox address syntax",                      // X.1.7
        "Bad sender's system address",                              // X.1.8
    ],
    [   // X.2.XXX Mailbox Status                   (mbox_*)
        "Other or undefined mailbox status",                        // X.2.0
        "Mailbox disabled, not accepting messages",                 // X.2.1
        "Mailbox full",                                             // X.2.2
        "Message length exceeds administrative limit",              // X.2.3
        "Mailing list expansion problem",                           // X.2.4
    ],
    [   // X.3.XXX Mail System Status               (sys_*)
        "Other or undefined mail system status",                    // X.3.0
        "Mail system full",                                         // X.3.1
        "System not accepting network messages",                    // X.3.2
        "System not capable of selected features",                  // X.3.3
        "Message too big for system",                               // X.3.4
        "System incorrectly configured",                            // X.3.5
    ],
    [   // X.4.XXX Network and Routing Status       (net_*)
        "Other or undefined network or routing status",             // X.4.0
        "No answer from host",                                      // X.4.1
        "Bad connection",                                           // X.4.2
        "Directory server failure",                                 // X.4.3
        "Unable to route",                                          // X.4.4
        "Mail system congestion",                                   // X.4.5
        "Routing loop detected",                                    // X.4.6
        "Delivery time expired",                                    // X.4.7
    ],
    [   // X.5.XXX Mail Delivery Protocol Status    (proto_*)
        "Other or undefined protocol status",                       // X.5.0
        "Invalid command",                                          // X.5.1
        "Syntax error",                                             // X.5.2
        "Too many recipients",                                      // X.5.3
        "Invalid command arguments",                                // X.5.4
        "Wrong protocol version",                                   // X.5.5
    ],
    [   // X.6.XXX Message Content or Media Status  (media_*)
        "Other or undefined media error",                           // X.6.0
        "Media not supported",                                      // X.6.1
        "Conversion required and prohibited",                       // X.6.2
        "Conversion required but not supported",                    // X.6.3
        "Conversion with loss performed",                           // X.6.4
        "Conversion failed",                                        // X.6.5
    ],
    [   // X.7.XXX Security or Policy Status        (sec_*)
        "Other or undefined security status",                       // X.7.0
        "Delivery not authorized, message refused",                 // X.7.1
        "Mailing list expansion prohibited",                        // X.7.2
        "Security conversion required but not possible",            // X.7.3
        "Security features not supported",                          // X.7.4
        "Cryptographic failure",                                    // X.7.5
        "Cryptographic algorithm not supported",                    // X.7.6
        "Message integrity failure",                                // X.7.7
    ]
];

function DSN(code, msg, def, subject, detail) {
    this.code = (/^[245]\d{2}/.exec(code)) ? code : null || def || 450;
    this.msg = msg;
    this.cls = parseInt(new String(this.code)[0]);
    this.sub = (enum_status_codes[subject]) ? subject : 0;
    this.det = (enum_status_codes[this.sub][detail]) ? detail : 0;
    this.default_msg = enum_status_codes[this.sub][this.det];
    // Handle multi-line replies
    if (Array.isArray(this.msg)) {
        this.reply = [];
        var m;
        while (m = this.msg.shift()) {
            this.reply.push([this.cls, this.sub, this.det].join('.') + ' ' + m);
        }
    } else {
        this.reply = [this.cls, this.sub, this.det].join('.') + ' ' + (this.msg || this.default_msg);
    }
}

exports.unspecified                 = function(msg, code) { return new DSN(code, msg, 450, 0, 0); }

// addr_*
exports.addr_unspecified            = function(msg, code) { return new DSN(code, msg, 450, 1, 0); }
exports.addr_bad_dest_mbox          = function(msg, code) { return new DSN(code, msg, 550, 1, 1); }
exports.no_such_user                = function(msg, code) { return new DSN(code, msg || 'No such user', 550, 1, 1); }
exports.addr_bad_dest_system        = function(msg, code) { return new DSN(code, msg, 550, 1, 2); }
exports.addr_bad_dest_syntax        = function(msg, code) { return new DSN(code, msg, 550, 1, 3); }
exports.addr_dest_ambigous          = function(msg, code) { return new DSN(code, msg, 450, 1, 4); }
exports.addr_rcpt_ok                = function(msg, code) { return new DSN(code, msg, 250, 1, 5); }
exports.addr_mbox_moved             = function(msg, code) { return new DSN(code, msg, 550, 1, 6); }
exports.addr_bad_from_syntax        = function(msg, code) { return new DSN(code, msg, 550, 1, 7); }
exports.addr_bad_from_system        = function(msg, code) { return new DSN(code, msg, 550, 1, 8); }

// mbox_*
exports.mbox_unspecified            = function(msg, code) { return new DSN(code, msg, 450, 2, 0); }
exports.mbox_disabled               = function(msg, code) { return new DSN(code, msg, 550, 2, 1); }
exports.mbox_full                   = function(msg, code) { return new DSN(code, msg, 450, 2, 2); }
exports.mbox_msg_too_long           = function(msg, code) { return new DSN(code, msg, 550, 2, 3); }
exports.mbox_list_expansion_problem = function(msg, code) { return new DSN(code, msg, 450, 2, 4); }

// sys_*
exports.sys_unspecified             = function(msg, code) { return new DSN(code, msg, 450, 3, 0); }
exports.sys_disk_full               = function(msg, code) { return new DSN(code, msg, 450, 3, 1); }
exports.sys_not_accepting_mail      = function(msg, code) { return new DSN(code, msg, 450, 3, 2); }
exports.sys_not_supported           = function(msg, code) { return new DSN(code, msg, 450, 3, 3); }
exports.sys_msg_too_big             = function(msg, code) { return new DSN(code, msg, 550, 3, 4); }
exports.sys_incorrectly_configured  = function(msg, code) { return new DSN(code, msg, 450, 3, 5); }

// net_*
exports.net_unspecified             = function(msg, code) { return new DSN(code, msg, 450, 4, 0); }
exports.net_no_answer               = function(msg, code) { return new DSN(code, msg, 450, 4, 1); }
exports.net_bad_connection          = function(msg, code) { return new DSN(code, msg, 450, 4, 2); }
exports.net_directory_server_failed = function(msg, code) { return new DSN(code, msg, 450, 4, 3); }
exports.temp_resolver_failed        = function(msg, code) { return new DSN(code, msg || 'Temporary address resolution failure', 450, 4, 3); }
exports.net_unable_to_route         = function(msg, code) { return new DSN(code, msg, 550, 4, 4); }
exports.net_system_congested        = function(msg, code) { return new DSN(code, msg, 450, 4, 5); }
exports.net_routing_loop            = function(msg, code) { return new DSN(code, msg, 550, 4, 6); }
exports.too_many_hops               = function(msg, code) { return new DSN(code, msg || 'Too many hops', 550, 4, 6); }
exports.net_delivery_time_expired   = function(msg, code) { return new DSN(code, msg, 550, 4, 7); }

// proto_*
exports.proto_unspecified           = function(msg, code) { return new DSN(code, msg, 450, 5, 0); }
exports.proto_invalid_command       = function(msg, code) { return new DSN(code, msg, 550, 5, 1); }
exports.proto_syntax_error          = function(msg, code) { return new DSN(code, msg, 550, 5, 2); }
exports.proto_too_many_rcpts        = function(msg, code) { return new DSN(code, msg, 450, 5, 3); }
exports.proto_invalid_cmd_args      = function(msg, code) { return new DSN(code, msg, 550, 5, 4); }
exports.proto_wrong_version         = function(msg, code) { return new DSN(code, msg, 450, 5, 5); }

// media_*
exports.media_unspecified           = function(msg, code) { return new DSN(code, msg, 450, 6, 0); }
exports.media_unsupported           = function(msg, code) { return new DSN(code, msg, 550, 6, 1); }
exports.media_conv_prohibited       = function(msg, code) { return new DSN(code, msg, 550, 6, 2); }
exports.media_conv_unsupported      = function(msg, code) { return new DSN(code, msg, 450, 6, 3); }
exports.media_conv_lossy            = function(msg, code) { return new DSN(code, msg, 450, 6, 4); }
exports.media_conv_failed           = function(msg, code) { return new DSN(code, msg, 450, 6, 5); }

// sec_*
exports.sec_unspecified             = function(msg, code) { return new DSN(code, msg, 450, 7, 0); }
exports.sec_unauthorized            = function(msg, code) { return new DSN(code, msg, 550, 7, 1); }
exports.bad_sender_ip               = function(msg, code) { return new DSN(code, msg || 'Bad sender IP', 550, 7, 1); }
exports.relaying_denied             = function(msg, code) { return new DSN(code, msg || 'Relaying denied', 550, 7, 1); }
exports.sec_list_expn_prohibited    = function(msg, code) { return new DSN(code, msg, 550, 7, 2); }
exports.sec_conv_failed             = function(msg, code) { return new DSN(code, msg, 550, 7, 3); }
exports.sec_feature_unsupported     = function(msg, code) { return new DSN(code, msg, 550, 7, 4); }
exports.sec_crypto_failure          = function(msg, code) { return new DSN(code, msg, 550, 7, 5); }
exports.sec_crypto_algo_unsupported = function(msg, code) { return new DSN(code, msg, 450, 7, 6); }
exports.sec_msg_integrity_failure   = function(msg, code) { return new DSN(code, msg, 550, 7, 7); }
