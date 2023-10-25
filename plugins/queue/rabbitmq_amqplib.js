// queue/rabbitmq_amqplib

const amqp = require("amqplib/callback_api");

let channel;
let queue;
let deliveryMode;

exports.register = function () {
    this.init_amqp_connection();
}

exports.rabbitmq_queue = function (next, connection) {
    if (!connection?.transaction) return next();

    connection.transaction.message_stream.get_data(str => {
        if (channel?.sendToQueue(queue, str, {deliveryMode})) {
            return next(OK);
        }
        else {
            this.logerror("Failed to queue to rabbitmq");
            return next();
        }
    });
}

exports.init_amqp_connection = function () {
    const cfg = this.config.get("rabbitmq.ini").rabbitmq;

    const protocol = cfg.protocol || "amqp";
    const host = cfg.host || "127.0.0.1";
    const port = cfg.port || "5672";
    const vhost = cfg.vhost || "";
    const user = cfg.user || "guest";
    const password = cfg.password || "guest";
    const exchangeName = cfg.exchangeName || "emailMessages";
    const exchangeType = cfg.exchangeType || "direct";
    const queueName = cfg.queueName || "emails";
    const durable = cfg.durable === "true" || true;
    // var confirm = cfg.confirm === "true" || true;
    const autoDelete = cfg.autoDelete === "true" || false;
    deliveryMode = cfg.deliveryMode || 2;

    amqp.connect(`${protocol}://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}${vhost}`, (err, conn) => {
        if (err) {
            this.logerror(`Connection to rabbitmq failed: ${err}`);
            return;
        }
        // TODO: if !confirm conn.createChannel...
        conn.createConfirmChannel((err2, ch) => {
            if (err2) {
                this.logerror(`Error creating rabbitmq channel: ${err2}`);
                return conn.close();
            }
            ch.assertExchange(exchangeName, exchangeType, {durable}, (err3, ok) => {
                if (err3) {
                    this.logerror(`Error asserting rabbitmq exchange: ${err3}`);
                    return conn.close();
                }
                ch.assertQueue(queueName,
                    {durable, autoDelete, arguments: this.config.get("rabbitmq.ini").queue_args},
                    (err4, ok2) => {
                        if (err4) {
                            this.logerror(`Error asserting rabbitmq queue: ${err4}`);
                            return conn.close();
                        }
                        queue = ok2.queue;
                        channel = ch;
                        this.register_hook('queue', 'rabbitmq_queue');
                    }
                );
            });
        });
    });
}
