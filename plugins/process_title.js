// process_title

exports.hook_init_master = function (next, server) {
    server.notes.pt_connections = 0;
    server.notes.pt_concurrent = 0;
    server.notes.pt_cps_diff = 0;
    server.notes.pt_cps_max = 0;
    server.notes.pt_messages = 0;
    server.notes.pt_mps_diff = 0;
    server.notes.pt_mps_max = 0;
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
                case 'message':
                    server.notes.pt_messages++;
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
    var server = connection.server;
    // Check that the hook above ran
    // It might not if the disconnection is immediate
    // echo "QUIT" | nc localhost 25 
    // will exhibit this behaviour.
    if (!connection.notes.pt_connect_run) {
        if (server.cluster) {
            server.cluster.worker.send('connect');
        }
        server.notes.pt_connections++;
        server.notes.pt_concurrent++;
    }
    var title = 'Haraka';
    if (server.cluster) {
        title = 'Haraka (worker)';
        var worker = server.cluster.worker;
        worker.send('disconnect');
    }
    server.notes.pt_concurrent--;
    return next();
}

exports.hook_data = function (next, connection) {
    var server = connection.server;
    var title = 'Haraka';
    if (server.cluster) {
        title = 'Haraka (worker)';
        var worker = server.cluster.worker;
        worker.send('message');
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
        // Update title
        process.title = title + ' cn=' + server.notes.pt_connections + 
            ' cc=' + server.notes.pt_concurrent + ' cps=' + cps + '/' + av_cps +
            '/' + server.notes.pt_cps_max + ' mps=' + mps + '/' + av_mps + '/' +
            server.notes.pt_mps_max;
    }, 1000);
}
