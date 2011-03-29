// log our denys

var deny_list = [];
var plugins = {};

var http  = require('http');
var urlp  = require('url');
var utils = require('./utils');
var width = 800;

exports.register = function () {
    var plugin = this;
    var port = this.config.get('grapher.http_port') || 8080;
    plugins = {queued: 0};
    
    this.config.get('plugins', 'list').forEach(
        function (p) {
            if (!p.match(/queue|graph|relay/)) {
                plugins[p] = 0;
            }
        }
    );
    
    
    var server = http.createServer(
        function (req, res) {
            plugin.handle_http_request(req, res);
    }).listen(port, "127.0.0.1");
    
    this.loginfo("http server running on port " + port);
};

exports.hook_deny = function (callback, connection, params) {
    params.unshift((new Date()).getTime());
    deny_list.push(params);
    
    callback(CONT);
};

exports.hook_queue_ok = function (callback, connection, params) {
    deny_list.push([new Date().getTime(), OK, "OK", "queued", "hook"]);
    callback(CONT);
};

exports.handle_http_request = function (req, res) {
    var parsed = urlp.parse(req.url, true);
    this.loginfo("Handling URL: " + parsed.href);
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
                    rollPeriod: 5,\
                    showRoller: false,\
                    labelsDiv: document.getElementById("labels"),\
                    labelsKMB: true\
                }\
              );\
              setInterval(function() {\
                graph.updateOptions( { file: "data?period=" + period } );\
              }, 10000);\
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
    var earliest = new Date(today - distance).getTime();
    var group_by = distance/width;
    var next_stop = earliest + group_by;
    
    var plugin = this;
    function write_to (data) {
        // plugin.logprotocol(data);
        res.write(data + "\n");
    }
    
    write_to("Date," + utils.sort_keys(plugins).join(','));
    
    var aggregate = reset_agg();
    var allpoints = reset_agg();
    
    for (var i = 0; i < deny_list.length; i++) {
        if (deny_list[i][0] < earliest) {
            continue;
        }
        while (deny_list[i][0] > next_stop) {
            write_to(utils.ISODate(new Date(next_stop)) + ',' + 
                utils.sort_keys(plugins).map(function(i){ return 1000 * (aggregate[i]/group_by) }).join(',')
            );
            aggregate = reset_agg();
            next_stop += group_by;
        }
        aggregate[deny_list[i][3]]++;
    }
    
    // write zeros if we didn't get up to now
    while (next_stop <= today) {
        write_to(utils.ISODate(new Date(next_stop)) + ',' + 
            utils.sort_keys(plugins).map(function(i){ return 1000 * (aggregate[i]/group_by) }).join(',')
        );
        aggregate = reset_agg();
        next_stop += group_by;
    }
    
    res.end();
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
