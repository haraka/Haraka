// queue/rabbitmq_amqplib

var amqp = require("amqplib/callback_api");

var channel;
var queue;
var deliveryMode;

exports.register = function () {
    this.init_amqp_connection();
}

exports.hook_queue = function(next, connection) {
    connection.transaction.message_stream.get_data(function(str) {
        if (channel.sendToQueue(queue, new Buffer(str), {deliveryMode: deliveryMode}))
            return next(OK);
        else
            return next();
    });
};

exports.init_amqp_connection = function() {
    var cfg = this.config.get("rabbitmq.ini").rabbitmq;

    var host = cfg.host || "127.0.0.1";
    var port = cfg.port || "5672";
    var user = cfg.user || "guest";
    var password = cfg.password || "guest";
    var exchangeName = cfg.exchangeName || "emailMessages";
    var exchangeType = cfg.exchangeType || "direct";
    var queueName = cfg.queueName || "emails";
    var durable = cfg.durable === "true" || true;
    // var confirm = cfg.confirm === "true" || true;
    var autoDelete = cfg.autoDelete === "true" || false;
    deliveryMode = cfg.deliveryMode || 2;

    amqp.connect("amqp://"+user+":"+password+"@"+host+":"+port, function(err, conn){
        if (err)
            return conn.close();
        // TODO: if !confirm conn.createChannel...
        conn.createConfirmChannel(function (err, ch) {
            if (err) return conn.close();
            ch.assertExchange(exchangeName, exchangeType, {durable: durable}, function(err, ok){
                if (err) return conn.close();
                ch.assertQueue(queueName,
                    {durable: durable, autoDelete: autoDelete},
                    function (err, ok) {
                        if (err) return conn.close();
                        queue = ok.queue;
                        channel = ch;
                    }
                );
            });
        });
    });
};
