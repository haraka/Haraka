// process_title

exports.hook_init_master = function (next, Server) {
    server.notes.pt_connections = 0;
    server.notes.pt_concurrent = 0;
    server.notes.pt_cps_diff = 0;
    server.notes.pt_cps_max = 0;
    var title = 'Haraka';
    if (server.cluster) {
        title = 'Haraka (master)';
        process.title = title;
        var cluster = server.cluster;
        var recvMsg = function (msg) {
            switch (msg) {
                case 'connect':
                    server.notes.pt_connections++;
                    server.notes.pt_concurrent++;
                    break;
                case 'disconnect':
                    server.notes.pt_concurrent--;
                    break;
                default:
                    // Unknown message
            }
        }
        // Register any new workers
        cluster.on('fork', function (worker) {
            cluster.workers[worker.id].on('message', recvMsg);
        });
    }
    setupInterval(title);
    return next();
}

exports.hook_init_child = function (next, Server) {
    server.notes.pt_connections = 0;
    server.notes.pt_concurrent = 0;
    server.notes.pt_cps_diff = 0;
    server.notes.pt_cps_max = 0;
    var title = 'Haraka (worker)';
    process.title = title;
    setupInterval(title);
    return next();
}

exports.hook_lookup_rdns = function (next, connection) {
    var title = 'Haraka';  
    if (server.cluster) {
        title = 'Haraka (worker)';
        var worker = server.cluster.worker;
        worker.send('connect');
    }
    server.notes.pt_connections++;
    server.notes.pt_concurrent++;
    return next(); 
}

exports.hook_disconnect = function (next, connection) {
    var title = 'Haraka';
    if (server.cluster) {
        title = 'Haraka (worker)';
        var worker = server.cluster.worker;
        worker.send('disconnect');
    }
    server.notes.pt_concurrent--;
    return next();
}

var setupInterval = function (title) {
    // Set up a timer to update title
    setInterval(function () {
        var av_cps = Math.round((server.notes.pt_connections/process.uptime()*100))/100;
        var cps = server.notes.pt_connections - server.notes.pt_cps_diff;
        if (cps > server.notes.pt_cps_max) server.notes.pt_cps_max = cps;
        process.title = title + ' cn=' + server.notes.pt_connections + 
            ' cc=' + server.notes.pt_concurrent + ' cps=' + cps + '/' + av_cps +
            '/' + server.notes.pt_cps_max;
        server.notes.pt_cps_diff = server.notes.pt_connections;
    }, 1000);
}
