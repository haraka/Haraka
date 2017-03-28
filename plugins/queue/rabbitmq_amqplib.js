// queue/rabbitmq_amqplib

var amqp = require("amqplib/callback_api");

var channel;
var queue;
var deliveryMode;

exports.register = function () {
    this.init_amqp_connection();
}

exports.rabbitmq_queue = function (next, connection) {
    var plugin = this;
    connection.transaction.message_stream.get_data(function (str) {
        if (channel && channel.sendToQueue(queue, new Buffer(str), {deliveryMode: deliveryMode})) {
            return next(OK);
        }
        else {
            plugin.logerror("Failed to queue to rabbitmq");
            return next();
        }
    });
};

exports.init_amqp_connection = function () {
    var plugin = this;
    var cfg = this.config.get("rabbitmq.ini").rabbitmq;

    var host = cfg.host || "127.0.0.1";
    var port = cfg.port || "5672";
    var vhost = cfg.vhost || "";
    var user = cfg.user || "guest";
    var password = cfg.password || "guest";
    var exchangeName = cfg.exchangeName || "emailMessages";
    var exchangeType = cfg.exchangeType || "direct";
    var queueName = cfg.queueName || "emails";
    var durable = cfg.durable === "true" || true;
    // var confirm = cfg.confirm === "true" || true;
    var autoDelete = cfg.autoDelete === "true" || false;
    deliveryMode = cfg.deliveryMode || 2;

    amqp.connect("amqp://"+user+":"+password+"@"+host+":"+port+vhost, function (err, conn){
        if (err) {
            plugin.logerror("Connection to rabbitmq failed: " + err);
            return;
        }
        // TODO: if !confirm conn.createChannel...
        conn.createConfirmChannel(function (err2, ch) {
            if (err2) {
                plugin.logerror("Error creating rabbitmq channel: " + err2);
                return conn.close();
            }
            ch.assertExchange(exchangeName, exchangeType, {durable: durable}, function (err3, ok){
                if (err3) {
                    plugin.logerror("Error asserting rabbitmq exchange: " + err3);
                    return conn.close();
                }
                ch.assertQueue(queueName,
                    {durable: durable, autoDelete: autoDelete},
                    function (err4, ok2) {
                        if (err4) {
                            plugin.logerror("Error asserting rabbitmq queue: " + err4);
                            return conn.close();
                        }
                        queue = ok2.queue;
                        channel = ch;
                        plugin.register_hook('queue', 'rabbitmq_queue');
                    }
                );
            });
        });
    });
};
