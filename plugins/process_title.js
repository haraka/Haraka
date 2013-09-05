// process_title

var outbound = require('./outbound');

exports.hook_init_master = function (next, server) {
    server.notes.pt_connections = 0;
    server.notes.pt_concurrent = 0;
    server.notes.pt_cps_diff = 0;
    server.notes.pt_cps_max = 0;
    server.notes.pt_messages = 0;
    server.notes.pt_mps_diff = 0;
    server.notes.pt_mps_max = 0;
    server.notes.pt_child_exits = 0;
    var title = 'Haraka';
    if (server.cluster) {
        title = 'Haraka (master)';
        process.title = title;
        server.notes.pt_concurrent_cluster = {};
        server.notes.pt_new_out_stats = [0,0,0,0];
        var cluster = server.cluster;
        var recvMsg = function (msg) {
            switch (msg.event) {
                case 'process_title.connect':
                    server.notes.pt_connections++;
                    server.notes.pt_concurrent_cluster[msg.wid]++;
                    var count = 0;
                    Object.keys(server.notes.pt_concurrent_cluster).forEach(function (id) {
                        count += server.notes.pt_concurrent_cluster[id];
                    });
                    server.notes.pt_concurrent = count;
                    break;
                case 'process_title.disconnect':
                    server.notes.pt_concurrent_cluster[msg.wid]--;
                    var count = 0;
                    Object.keys(server.notes.pt_concurrent_cluster).forEach(function (id) {
                        count += server.notes.pt_concurrent_cluster[id];
                    });
                    server.notes.pt_concurrent = count;
                    break;
                case 'process_title.message':
                    server.notes.pt_messages++;
                    break;
                case 'process_title.outbound_stats':
                    var out_stats = msg.data.split('/');
                    for (var i=0; i<out_stats.length; i++) {
                        server.notes.pt_new_out_stats[i] += parseInt(out_stats[i], 10);
                    }
                    server.notes.pt_new_out_stats[3]++;
                    // Check if we got all results back yet
                    if (server.notes.pt_new_out_stats[3] === Object.keys(cluster.workers).length) {
                        server.notes.pt_out_stats = server.notes.pt_new_out_stats.slice(0,3).join('/');
                        server.notes.pt_new_out_stats = [0,0,0,0];
                    }
                default:
                    // Unknown message
            }
        }
        // Register any new workers
        cluster.on('fork', function (worker) {
            server.notes.pt_concurrent_cluster[worker.id] = 0;
            cluster.workers[worker.id].on('message', recvMsg);
        });
        cluster.on('exit', function (worker) {
            delete server.notes.pt_concurrent_cluster[worker.id];
            // Update concurrency
            var count = 0;
            Object.keys(server.notes.pt_concurrent_cluster).forEach(function (id) {
                count += server.notes.pt_concurrent_cluster[id];
            });
            server.notes.pt_concurrent = count;
            server.notes.pt_child_exits++;
        });
    }
    setupInterval(title, server);
    return next();
}

exports.hook_init_child = function (next, server) {
    server.notes.pt_connections = 0;
    server.notes.pt_concurrent = 0;
    server.notes.pt_cps_diff = 0;
    server.notes.pt_cps_max = 0;
    server.notes.pt_messages = 0;
    server.notes.pt_mps_diff = 0;
    server.notes.pt_mps_max = 0;
    var title = 'Haraka (worker)';
    process.title = title;
    setupInterval(title, server);
    return next();
}

exports.hook_lookup_rdns = function (next, connection) {
    var server = connection.server;
    connection.notes.pt_connect_run = true;
    if (server.cluster) {
        var worker = server.cluster.worker;
        worker.send({event: 'process_title.connect', wid: worker.id});
    }
    server.notes.pt_connections++;
    server.notes.pt_concurrent++;
    return next(); 
}

exports.hook_disconnect = function (next, connection) {
    var server = connection.server;
    // Check that the hook above ran
    // It might not if the disconnection is immediate
    // echo "QUIT" | nc localhost 25 
    // will exhibit this behaviour.
    if (!connection.notes.pt_connect_run) {
        if (server.cluster) {
            var worker = server.cluster.worker;
            worker.send({event: 'process_title.connect', wid: worker.id});
        }
        server.notes.pt_connections++;
        server.notes.pt_concurrent++;
    }
    if (server.cluster) {
        var worker = server.cluster.worker;
        worker.send({event: 'process_title.disconnect', wid: worker.id});
    }
    server.notes.pt_concurrent--;
    return next();
}

exports.hook_data = function (next, connection) {
    var server = connection.server;
    if (server.cluster) {
        var worker = server.cluster.worker;
        worker.send({event: 'process_title.message'});
    }
    server.notes.pt_messages++;
    return next();
}


var setupInterval = function (title, server) {
    // Set up a timer to update title
    setInterval(function () {
        // Connections per second
        var av_cps = Math.round((server.notes.pt_connections/process.uptime()*100))/100;
        var cps = server.notes.pt_connections - server.notes.pt_cps_diff;
        if (cps > server.notes.pt_cps_max) server.notes.pt_cps_max = cps;
        server.notes.pt_cps_diff = server.notes.pt_connections;
        // Messages per second
        var av_mps = Math.round((server.notes.pt_messages/process.uptime()*100))/100;
        var mps = server.notes.pt_messages - server.notes.pt_mps_diff;
        if (mps > server.notes.pt_mps_max) server.notes.pt_mps_max = mps;
        server.notes.pt_mps_diff = server.notes.pt_messages;
        var out = server.notes.pt_out_stats || outbound.get_stats();
        if (/\(worker\)/.test(title)) {
            process.send({event: 'process_title.outbound_stats', data: out});
        }
        // Update title
        var new_title = title + ' cn=' + server.notes.pt_connections + 
            ' cc=' + server.notes.pt_concurrent + ' cps=' + cps + '/' + av_cps +
            '/' + server.notes.pt_cps_max + ' msgs=' + server.notes.pt_messages +
            ' mps=' + mps + '/' + av_mps + '/' +
            server.notes.pt_mps_max + ' out=' + out + ' ';
        if (/\(master\)/.test(title)) {
            new_title += 'respawn=' + server.notes.pt_child_exits + ' ';
        }
        process.title = new_title;
    }, 1000);
}
