// Look up URLs in SURBL
var url  = require('url');
var dns  = require('dns');
var logger = require('./logger');

var two_level_tlds = {};

exports.hook_data = function (callback, connection) {
    // enable mail body parsing
    connection.transaction.parse_body = 1;
    callback(CONT);
}

exports.hook_data_post = function (callback, connection) {
    var zones = this.config.get('data.uribl.zones', 'list');
    
    this.config.get('data.uribl.two_level_tlds', 'list').forEach(function (tld) {
        two_level_tlds[tld] = 1;
    });
    
    // this.loginfo(two_level_tlds);
    
    var urls = {};
    
    // this.loginfo(connection.transaction.body);
    
    extract_urls(urls, connection.transaction.body);
    
    var hosts = Object.keys(urls);
    
    var pending_queries = 0;
    var callback_ran = 0;
    var plugin = this;
    
    for (var i=0,l=hosts.length; i < l; i++) {
        var host = hosts[i];
        var match = host.match(/([^\.]+\.)?([^\.]+\.[^\.]+)$/);
        if (match && !host.match(/^\d+\.\d+\.\d+\.\d+$/)) {
            if (two_level_tlds[match[2]]) {
                host = match[0];
            }
            else {
                host = match[2];
            }
        }
        // Now query for "host".zone
        for (var i=0,l=zones.length; i < l; i++) {
            pending_queries++;
            this.logdebug("Looking up: " + host + '.' + zones[i]);
            dns.resolveTxt(host + '.' + zones[i], function (err, addresses) {
                pending_queries--;
                if (!err) {
                    if (!callback_ran) {
                        callback_ran++;
                        return callback(DENY, addresses);
                    }
                }
                if (pending_queries === 0) {
                    callback(CONT);
                }
            });
        }
    }
    
    if (pending_queries === 0) {
        // we didn't execute any DNS queries
        callback(CONT);
    }
}

var numeric_ip = /\w{3,16}:\/+(\S+@)?(\d+|0[xX][0-9A-Fa-f]+)\.(\d+|0[xX][0-9A-Fa-f]+)\.(\d+|0[xX][0-9A-Fa-f]+)\.(\d+|0[xX][0-9A-Fa-f]+)/g;
var schemeless = /((?:www\.)?[a-zA-Z0-9][a-zA-Z0-9\-.]+\.(?:aero|arpa|asia|biz|cat|com|coop|edu|gov|info|int|jobs|mil|mobi|museum|name|net|org|pro|tel|travel|[a-zA-Z]{2}))(?!\w)/g;
var schemed    = /(\w{3,16}:\/+(?:\S+@)?([a-zA-Z0-9][a-zA-Z0-9\-.]+\.(?:aero|arpa|asia|biz|cat|com|coop|edu|gov|info|int|jobs|mil|mobi|museum|name|net|org|pro|tel|travel|[a-zA-Z]{2})))(?!\w)/g;

function extract_urls (urls, body) {
    // extract from body.bodytext
    var match;
    // extract numeric URIs
    while (match = numeric_ip.exec(body.bodytext)) {
        var uri = url.parse(match[0]);
        urls[uri.hostname.split(/\./).reverse().join('.')] = uri;
    }
    
    // match plain hostname.tld
    while (match = schemeless.exec(body.bodytext)) {
        var uri = url.parse('http://' + match[1]);
        urls[uri.hostname] = uri;
    }
    
    // match http:// URI
    while (match = schemed.exec(body.bodytext)) {
        var uri = url.parse(match[1]);
        urls[uri.hostname] = uri;
    }
    
    for (var i=0,l=body.children.length; i < l; i++) {
        extract_urls(urls, body.children[i]);
    }
}
