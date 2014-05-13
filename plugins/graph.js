// log our denys

var http  = require('http');
var urlp  = require('url');
var utils = require('./utils');

var db;
var select = "SELECT COUNT(*) AS hits, plugin FROM graphdata WHERE timestamp >= ? AND timestamp < ? GROUP BY plugin";
var insert;
var plugins = {};
var config;

var width = 800;

function createTable() {
    db.exec( "CREATE TABLE IF NOT EXISTS graphdata (timestamp INTEGER NOT NULL, plugin TEXT NOT NULL)")
      .exec( "CREATE INDEX IF NOT EXISTS graphdata_idx ON graphdata (timestamp)");
}

exports.register = function () {
    var plugin = this;
    config  = plugin.config.get('graph.ini');
    var ignore_re = config.main.ignore_re || plugin.config.get('grapher.ignore_re') || 'queue|graph|relay';
    ignore_re = new RegExp(ignore_re);
    
    plugins = {accepted: 0, disconnect_early: 0};
    
    plugin.config.get('plugins', 'list').forEach(
        function (p) {
            if (!p.match(ignore_re)) {
                plugins[p] = 0;
            }
        }
    );

    try {
        var sqlite3 = require('sqlite3').verbose();
    }
    catch (e) {
        plugin.logerror("unable to load sqlite3, try\n\n\t'npm install -g sqlite3'\n\n");
        return;
    }

    var db_name = config.main.db_file || 'graphlog.db';
    db = new sqlite3.Database(db_name, createTable);
    insert = db.prepare( "INSERT INTO graphdata VALUES (?,?)" );

    plugin.register_hook('init_master',   'http_init');
    plugin.register_hook('disconnect',    'disconnect');
    plugin.register_hook('deny',          'deny');
    plugin.register_hook('queue_ok',      'queue_ok');
};

exports.http_init = function (next) {
    var plugin = this;
    var port   = config.main.http_port || this.config.get('grapher.http_port') || 8080;
    var addr   = config.main.http_addr || '127.0.0.1';
    var server = http.createServer(
        function (req, res) {
            plugin.handle_http_request(req, res);
        });

    server.on('error', function (err) {
        plugin.logerror("http server failed to start. Maybe running elsewhere?" + err);
        next(DENY);
    });

    server.listen(port, addr, function () {
        plugin.loginfo("http server running on " + addr + ':' + port);
        next();
    });
};

exports.disconnect = function (next, connection) {
    if (!connection.current_line) {
        // disconnect without saying anything
        return this.hook_deny(next, connection, [DENY, "random disconnect", "disconnect_early"]);
    }
    next();
};

exports.deny = function (next, connection, params) {
    var plugin = this;
    insert.bind([new Date().getTime(), params[2]], function (err) {
        if (err) {
            plugin.logerror("Insert DENY failed: " + err);
            return next();
        }
        insert.run(function (err, rows) {
            if (err) {
                plugin.logerror("Insert failed: " + err);
            }
            try { insert.reset(); } catch (e) {}
            next();
        });
    });
};

exports.hook_queue_ok = function (next, connection, params) {
    var plugin = this;
    insert.bind([new Date().getTime(), 'accepted'], function (err) {
        if (err) {
            plugin.logerror("Insert DENY failed: " + err);
            return next();
        }
        insert.run(function (err, rows) {
            if (err) {
                plugin.logerror("Insert failed: " + err);
            }
            try { insert.reset() } catch (err) {}
            next();
        });
    });
};

exports.handle_http_request = function (req, res) {
    var parsed = urlp.parse(req.url, true);
    // this.loginfo("Handling URL: " + parsed.href);
    switch (parsed.pathname) {
        case '/':
            this.handle_root(res, parsed);
            break;
        case '/data':
            this.handle_data(res, parsed);
            break;
        default:
            this.handle_404(res, parsed);
    }
};

exports.handle_root = function (res, parsed) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<html>\
        <head>\
            <title>Haraka Mail Graphs</title>\
            <script src="http://dygraphs.com/dygraph-combined.js"\
               type="text/javascript"></script>\
          </head>\
          <body onload="onLoad();">\
          <script>\
            var interval_id;\
            function onLoad(period) {\
              if (!period) {\
                  period = document.location.hash.replace(\'#\',\'\') || \'day\';\
              }\
              var graph = new Dygraph(\
                document.getElementById("graph"),\
                "data?period=" + period,\
                {\
                    connectSeparatedPoints: true,\
                    fillGraph: true,\
                    stackedGraph: true,\
                    legend: "always",\
                    rollPeriod: 10,\
                    showRoller: true,\
                    labelsDiv: document.getElementById("labels"),\
                    labelsKMB: true,\
                    ylabel: "Emails Per Minute",\
                    labelsSeparateLines: true,\
                }\
              );\
              if (interval_id) {\
                clearInterval(interval_id);\
                interval_id = null;\
              }\
              if (period === "hour") {\
                interval_id = setInterval(function() {\
                  graph.updateOptions( { file: "data?period=" + period } );\
                }, 10000);\
              }\
            }\
          </script>\
            <h1>Haraka Mail Graphs</h1>\
            <div style="text-indent: 100px;">\
            <a href="#year" onclick="onLoad(\'year\');">Year</a>\
            <a href="#month" onclick="onLoad(\'month\');">Month</a>\
            <a href="#week" onclick="onLoad(\'week\');">Week</a>\
            <a href="#day" onclick="onLoad(\'day\');">Day</a>\
            <a href="#hour" onclick="onLoad(\'hour\');">Hour</a>\
            </div>\
            <hr>\
            <div id="graph" style="height: 300px; width: ' + width + 'px;"></div>\
            <div id="labels"></div>\
          </body>\
        </html>\
    ');
};

exports.handle_data = function (res, parsed) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    var distance;
    // this.loginfo("query period: " + (parsed.query.period || 'day'));
    switch (parsed.query.period) {
        case 'year':
            distance = (86400000 * 365);
            break;
        case 'month':
            distance = (86400000 * 7 * 4); // ok, so 4 weeks
            break;
        case 'week':
            distance = (86400000 * 7);
            break;
        case 'hour':
            distance = 3600000;
            break;
        case 'day':
        default:
            distance = 86400000;
    }
    
    var today    = new Date().getTime();
    var earliest = today - distance;
    var group_by = distance/width; // one data point per pixel
    
    res.write("Date," + utils.sort_keys(plugins).join(',') + "\n");
    
    this.get_data(res, earliest, today, group_by);
};

exports.get_data = function (res, earliest, today, group_by) {
    var next_stop = earliest + group_by;
    var aggregate = reset_agg();
    var plugin = this;
    
    function write_to (data) {
        // plugin.loginfo(data);
        res.write(data + "\n");
    }
    
    db.each(select, [earliest, next_stop], function (err, row) {
        if (err) {
            res.end();
            return plugin.logerror("SELECT failed: " + err);
        }
        plugin.loginfo("got: " + row.hits + ", " + row.plugin + " next_stop: " + next_stop);

        aggregate[row.plugin] = row.hits;
    },
    function (err, rows ) {
            write_to(utils.ISODate(new Date(next_stop)) + ',' + 
                utils.sort_keys(plugins).map(function(i){ return 1000 * 60 * (aggregate[i]/group_by) }).join(',')
            );
            if (next_stop >= today) {
                return res.end();
            }
            else {
                return process.nextTick(function () {
                    plugin.get_data(res, next_stop, today, group_by);
                });
            }
        }
    );
};

var reset_agg = function () {
    var agg = {};
    for (var p in plugins) {
        agg[p] = 0;
    }
    return agg;
};

exports.handle_404 = function (res, parsed) {
    this.logerror("404: " + parsed.href);
    res.writeHead(404);
    res.end('No such file: ' + parsed.href);
};
