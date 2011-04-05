// Look up URLs in SURBL
var util = require('util');
var url  = require('url');

exports.hook_data = function (callback, connection) {
    // enable mail body parsing
    connection.transaction.parse_body = 1;
    callback(CONT);
}

exports.hook_data_post = function (callback, connection) {
    var zones = this.config.get('data.uribl.zones', 'list');
    
    var urls = {};
    
    // this.loginfo(connection.transaction.body);
    
    extract_urls(urls, connection.transaction.body);
        
    callback(CONT);
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
        urls[uri.hostname] = uri;
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
    
    if (body.children.length) {
        // has kids
        body.children.forEach(function (b) { extract_urls(urls, b) });
    }
}
