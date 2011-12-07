// Look up URLs in SURBL
var url       = require('url');
var dns       = require('dns');
var isIPv4    = require('net').isIPv4;
var net_utils = require('./net_utils.js');

// Default regexps to extract the URIs from the message
var numeric_ip = /\w{3,16}:\/+(\S+@)?(\d+|0[xX][0-9A-Fa-f]+)\.(\d+|0[xX][0-9A-Fa-f]+)\.(\d+|0[xX][0-9A-Fa-f]+)\.(\d+|0[xX][0-9A-Fa-f]+)/gi;
var schemeless = /((?:www\.)?[a-zA-Z0-9][a-zA-Z0-9\-.]+\.(?:aero|arpa|asia|biz|cat|com|coop|edu|gov|info|int|jobs|mil|mobi|museum|name|net|org|pro|tel|travel|xxx|[a-zA-Z]{2}))(?!\w)/gi;
var schemed    = /(\w{3,16}:\/+(?:\S+@)?([a-zA-Z0-9][a-zA-Z0-9\-.]+\.(?:aero|arpa|asia|biz|cat|com|coop|edu|gov|info|int|jobs|mil|mobi|museum|name|net|org|pro|tel|travel|xxx|[a-zA-Z]{2})))(?!\w)/gi;

var lists;
var zones;
var excludes = {};

function check_excludes_list(host) {
    host = host.toLowerCase().split('.').reverse();
    for (var i=0; i < host.length; i++) {
        if (i === 0) {
            var check = host[i];
        } 
        else {
            check = [ host[i], check ].join('.');
        }
        if (excludes[check]) {
            return true;
        }
    }
    return false;
}

exports.register = function() {
    // Override regexps if top_level_tlds file is present
    if (net_utils.top_level_tlds && Object.keys(net_utils.top_level_tlds).length) {
        this.logdebug('Building new regexps from TLD file');
        var re_schemeless = '((?:www\\.)?[a-zA-Z0-9][a-zA-Z0-9\\-.]+\\.(?:' +
            Object.keys(net_utils.top_level_tlds).join('|') + '))(?!\\w)';
        schemeless = new RegExp(re_schemeless, 'gi');
        var re_schemed = '(\\w{3,16}:\\/+(?:\\S+@)?([a-zA-Z0-9][a-zA-Z0-9\\-.]+\\.(?:' +
            Object.keys(net_utils.top_level_tlds).join('|') + ')))(?!\\w)';
        schemed = new RegExp(re_schemed, 'gi');
    }
}

exports.load_uri_config = function (next) {
    lists = this.config.get('data.uribl.ini');
    zones = Object.keys(lists);
    if (!zones || !zones.length > 1) {
        this.logerr('aborting: no zones configured');
        return next();
    }
    // Load excludes
    this.config.get('data.uribl.excludes', 'list').forEach(function (domain) {
        excludes[domain.toLowerCase()] = 1;
    });
    // Set defaults
    if (lists.main && !lists.main.max_uris_per_list) {
        lists.main.max_uris_per_list = 20;
    }
}

exports.do_lookups = function (connection, next, hosts, type) {
    var plugin = this;

    if (typeof hosts === 'string') {
        hosts = [ hosts ];
    }
    if (!hosts || (hosts && !hosts.length)) {
        connection.logdebug(plugin, '(' + type + ') no items found for lookup');
        return next();
    } 
    else {
        connection.logdebug(plugin, '(' + type + ') found ' + hosts.length + ' items for lookup');
    }
    var queries = {};
    for (var i=0; i < hosts.length; i++) {
        var host = hosts[i].toLowerCase();
        connection.logdebug(plugin, '(' + type + ') checking: ' + host);
        // Make sure we have a valid TLD
        if (!isIPv4(host) && !net_utils.top_level_tlds[(host.split('\.').reverse())[0]]) {
            continue;
        }
        // Check the exclusion list
        if (check_excludes_list(host)) {
            connection.logdebug(plugin, 'skipping excluded domain:' + host);
            continue;
        }
        // Loop through the zones
        for (var j=0; j < zones.length; j++) {
            var zone = zones[j];
            if (zone === 'main') continue;  // skip config
            if (!lists[zone] || (lists[zone] && !/^(?:1|true|yes|enabled|on)$/i.test(lists[zone][type]))) {
                connection.logdebug(plugin, 'skipping zone ' + zone + ' as it does not support lookup type ' + type);
                continue;
            }
            // Convert in-addr.arpa into bare IPv4 lookup
            var arpa = host.split(/\./).reverse();
            if (arpa.shift() === 'arpa' && arpa.shift() === 'in-addr') {
                host = arpa.join('.');
            }
            var lookup;
            // Handle zones that do not allow IP queries (e.g. Spamhaus DBL)
            if (isIPv4(host)) {
                if (/^(?:1|true|yes|enabled|on)$/i.test(lists[zone].no_ip_lookups)) {
                    connection.logdebug(plugin, 'skipping IP lookup (' + host + ') for zone ' + zone);
                    continue;
                }
                // Skip any private IPs
                if (net_utils.is_rfc1918(host)) continue;
                // Reverse IP for lookup
                lookup = host.split(/\./).reverse().join('.');
            }
            // Handle zones that require host to be stripped to a domain boundary
            else if (/^(?:1|true|yes|enabled|on)$/i.test(lists[zone].strip_to_domain)) {
                lookup = (net_utils.split_hostname(host, 3))[1];
            }
            // Anything else..
            else {
                lookup = host;
            }
            if (!lookup) continue;
            if (!queries[zone]) queries[zone] = {};
            if (Object.keys(queries[zone]).length > lists.main.max_uris_per_list) {
                connection.logwarn(plugin, 'discarding lookup ' + lookup + ' for zone ' +
                              zone + ' maximum query limit reached');
                continue;
            }
            queries[zone][lookup] = 1;
        }
    }

    // Flatten object into array for easier querying
    var queries_to_run = [];
    for (var j=0; j < Object.keys(queries).length; j++) {
        for (var k=0; k < Object.keys(queries[Object.keys(queries)[j]]).length; k++) {
            // host/domain, zone
            queries_to_run.push( [ Object.keys(queries[Object.keys(queries)[j]])[k], Object.keys(queries)[j] ] );
        }
    }
    // Randomize the order a bit
    queries_to_run.sort(Math.round(Math.random())-0.25);

    if(!queries_to_run.length) {
        return next();
    }

    // Perform the lookups
    var plugin = this;
    var pending_queries = 0;
    var called_next = false;

    var timer = setTimeout(function () {
        connection.logdebug(plugin, 'timeout');
        if (!called_next) {
            called_next = true;
            return next();
        }
    }, ((lists.main && lists.main.timeout) ? 
        lists.main.timeout : 30) * 1000);

    queries_to_run.forEach(function (query) {
        var lookup = query.join('.');
        // Add root dot if necessary
        if (lookup[lookup.length-1] !== '.') {
            lookup = lookup + '.';
        }
        pending_queries++;
        dns.resolve4(lookup, function(err, addrs) {
            pending_queries--;
            connection.logdebug(plugin, lookup + ' => ' + ((err) ? err : addrs.join(', ')));
            if (!err && !called_next) {
                var skip = false;
                var do_reject = function (msg) {
                    if (!skip && !called_next) {
                        if (!msg) {
                            msg = query[0] + ' blacklisted in ' + query[1];
                        }
                        // Check for custom message
                        if (lists[query[1]] && lists[query[1]].custom_msg) {
                            msg = lists[query[1]].custom_msg.replace(/\{uri\}/g, query[0]).replace(/\{zone\}/g, query[1]);
                        }
                        clearTimeout(timer);
                        called_next = true;
                        return next(DENY, msg);
                    }
                }
                // Optionally validate first result against a regexp
                if (lists[query[1]] && lists[query[1]].validate) {
                    var re = new RegExp(lists[query[1]].validate);
                    if (!re.test(addrs[0])) {
                        connection.logdebug(plugin, 'ignoring result (' + addrs[0] + ') for: ' + 
                                lookup + ' as it did not match validation rule');
                        var skip = true;
                    }
                }
                // Check for optional bitmask
                if (lists[query[1]] && lists[query[1]].bitmask) {
                    // A bitmask zone should only return a single result
                    // We only support a bitmask of up to 128 in a single octet
                    var last_octet = new Number((addrs[0].split('.'))[3]);
                    var bitmask = new Number(lists[query[1]].bitmask);
                    if ((last_octet & bitmask) > 0) {
                        connection.loginfo(plugin, 'found ' + query[0] + ' in zone ' + query[1] +
                            ' (' + addrs.join(',') + '; bitmask=' + bitmask + ')');
                        do_reject();
                    } else {
                        connection.logdebug(plugin, 'ignoring result (' + addrs[0] + ') for: ' + 
                                lookup + ' as the bitmask did not match');
                        var skip = true;
                    }
                }
                else {
                    connection.loginfo(plugin, 'found ' + query[0] + ' in zone ' + query[1] + 
                        ' (' + addrs.join(',') + ')');
                    do_reject();
                }
            }
            if (!called_next && pending_queries === 0) {
                clearTimeout(timer);
                return next();
            }
        });
    });

    if (pending_queries === 0) {
        return next();
    }
}

exports.hook_lookup_rdns = function (next, connection) {
    this.load_uri_config(next);
    var plugin = this;
    dns.reverse(connection.remote_ip, function (err, rdns) {
        if (err) return next();
        plugin.do_lookups(connection, next, rdns, 'rdns');
    });
}

exports.hook_ehlo = function (next, connection, helo) {
    this.load_uri_config(next);
    // Handle IP literals
    var literal;
    if ((literal = /^\[(\d+\.\d+\.\d+\.\d+)\]$/.exec(helo))) {
        this.do_lookups(connection, next, literal[1], 'helo');
    } else {
        this.do_lookups(connection, next, helo, 'helo');
    }
}
exports.hook_helo = exports.hook_ehlo;

exports.hook_mail = function (next, connection, params) {
    this.load_uri_config(next);
    this.do_lookups(connection, next, params[0].host, 'envfrom');
}

exports.hook_data = function (next, connection) {
    // enable mail body parsing
    connection.transaction.parse_body = 1;
    return next();
}

exports.hook_data_post = function (next, connection) {
    this.load_uri_config(next);
    var email_re = /<?[^@]+@([^> ]+)>?/;
    var plugin = this;
    var trans = connection.transaction;

    // From header
    var do_from_header = function (cb) {
        var from = trans.header.get('from');
        var fmatch;
        if (fmatch = email_re.exec(from)) {
            return plugin.do_lookups(connection, cb, fmatch[1], 'from');
        }
        cb();
    }

    // Reply-To header
    var do_replyto_header = function (cb) {
        var replyto = trans.header.get('reply-to');
        var rmatch;
        if (rmatch = email_re.exec(replyto)) {
            return plugin.do_lookups(connection, cb, rmatch[1], 'replyto');
        }
        cb();
    }

    // Message-Id header
    var do_msgid_header = function (cb) {
        var msgid = trans.header.get('message-id');
        var mmatch;
        if (mmatch = /@([^>]+)>/.exec(msgid)) {
            return plugin.do_lookups(connection, cb, mmatch[1], 'msgid');
        }
        cb();
    }

    // Body
    var do_body = function (cb) {
        var urls = {};
        extract_urls(urls, trans.body);
        return plugin.do_lookups(connection, cb, Object.keys(urls), 'body');
    }

    var chain = [ do_from_header, do_replyto_header, do_msgid_header, do_body ];
    var chain_caller = function (code, msg) {
        if (code) {
            return next(code, msg);
        }
        if (!chain.length) {
            return next();
        }
        var next_in_chain = chain.shift();
        next_in_chain(chain_caller);
    }
    chain_caller();
}

function extract_urls (urls, body) {
    // extract from body.bodytext
    var match;

    // extract numeric URIs
    while (match = numeric_ip.exec(body.bodytext)) {
        var uri = url.parse(match[0]);
        // Don't reverse the IPs here; we do it in the lookup
        urls[uri.hostname] = uri;
    }
    
    // match plain hostname.tld
    while (match = schemeless.exec(body.bodytext)) {
        var uri = url.parse('http://' + match[1]);
        urls[uri.hostname] = uri;
    }
    
    // match scheme:// URI
    while (match = schemed.exec(body.bodytext)) {
        var uri = url.parse(match[1]);
        urls[uri.hostname] = uri;
    }
    
    // TODO: URIHASH
    // TODO: MAILHASH 

    for (var i=0,l=body.children.length; i < l; i++) {
        extract_urls(urls, body.children[i]);
    }
}
