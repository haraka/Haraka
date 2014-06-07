// rcpt_to.routes.js
//
// validates incoming recipients against flat file & Redis
// routes mail based on per-user or per-domain specified routes

exports.register = function() {
    var plugin = this;
    plugin.cfg = {};
    plugin.route_list={};

    var load_config = function () {
        plugin.loginfo(plugin, "loading router.ini");
        plugin.cfg = plugin.config.get('router.ini', load_config);

        var lowered = {};
        if (plugin.cfg.routes) {
            var keys = Object.keys(plugin.cfg.routes);
            for (var i=0; i < keys.length; i++) {
                lowered[keys[i].toLowerCase()] = plugin.cfg.routes[keys[i]];
            }
            plugin.route_list = lowered;
        }
    };
    load_config();
};

exports.hook_rcpt = function(next, connection, params) {
    var plugin = this;
    var txn = connection.transaction;
    if (!txn) { return next(); }

    var rcpt = params[0];

    // ignore RCPT TO without an @ first
    if (!rcpt.host) {
        txn.results.add(plugin, {fail: 'rcpt!domain'});
        return next();
    }

    var address = rcpt.address().toLowerCase();
    var domain = rcpt.host.toLowerCase();

    connection.logdebug(plugin, "Checking for " + address);

    // TODO: check Redis
 
    if (plugin.route_list[address]) { return next(OK); }
    if (plugin.route_list[domain])  { return next(OK); }

    // not permitted (by this rcpt_to plugin)
    return next();
};

exports.get_mx = function(next, hmail, domain) {
    var plugin = this;
    // hmail: 
    // {"queue_time":1402091363826,
    //  "domain":"tnpi.net",
    //  "rcpt_to":[{"original":"matt@tnpi.net","user":"matt","host":"tnpi.net"}],
    //  "mail_from":{"original":"<>",
    //  "user":null,
    //  "host":null},
    //  "notes":{},
    //  "uuid":"DFB28F2B-CC21-438B-864D-934E6860AB61.1"
    // }

    // get email address
    var address = hmail.rcpt_to[0].original.toLowerCase();

    // check email adress for route
    if (plugin.route_list[address]) {
        return next(OK, plugin.route_list[address]);
    }

    // check email domain for route
    if (plugin.route_list[domain]) {
        return next(OK, plugin.route_list[domain]);
    }

    plugin.loginfo(plugin, 'using normal MX lookup for: ' + address);
    return next();
};
