var util = require('util'),
    pg = require('pg');

exports.register = function () {
    this.logdebug("Initializing rcpt_to validity plugin.");
    var config = this.config.get('rcpt_to.validity.json');

    var dbConfig = {
        user: config.user,
        database: config.database,
        password: config.password,
        host: config.host,
        port: config.port,
        max: config.max,
        idleTimeoutMillis: config.idleTimeoutMillis
    };

    //Initialize the connection pool.
    this.pool = new pg.Pool(dbConfig);

    /**
     * If an error is encountered by a client while it sits idle in the pool the pool itself will emit an
     * error event with both the error and the client which emitted the original error.
     */
    this.pool.on('error', function (err, client) {
        this.logerror('Idle client error. Probably a network issue or a database restart.'
            + err.message + err.stack);
    });

    this.sqlQuery = config.sqlQuery;
};

exports.hook_rcpt = function (next, connection, params) {
    var rcpt = params[0];

    this.logdebug("Checking validity of " + util.inspect(params[0]));

    this.is_user_valid(rcpt.user, function (isValid) {
        if (isValid) {
            connection.logdebug("Valid email recipient. Continuing...", this);
            next();
        } else {
            connection.logdebug("Invalid email recipient. DENY email receipt.", this);
            next(DENY, "Invalid email address.");
        }
    });
};

exports.shutdown = function () {
    this.loginfo("Shutting down validity plugin.");
    this.pool.end();
};


exports.is_user_valid = function (userID, callback) {
    var plugin = this;

    plugin.pool.connect(function (err, client, done) {
        if (err) {
            plugin.logerror('Error fetching client from pool. ' + err);
            return callback(false);
        }

        client.query(plugin.sqlQuery,
            [userID], function (err, result) {

                //Release the client back to the pool by calling the done() callback.
                done();

                if (err) {
                    plugin.logerror('Error running query. ' + err);
                    return callback(false);
                }

                return callback(result.rows[0].exists);
            });
    });
};