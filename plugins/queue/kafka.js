// kafka

const { Kafka, logLevel } = require('kafkajs')

exports.register = function () {
    this.init_producer();
}

exports.hook_queue = function (next, connection) {
    if (!connection?.transaction) return next();

    connection.transaction.message_stream.get_data(value => {
        this.producer.send({
            topic: this.topic,
            timeout: this.timeout,
            messages: [
                {
                    key: connection.transaction.header.get("Message-ID"),
                    value,
                }
            ],
        }).then((record) => {
            this.logdebug("Queued to kafka:", record);
            return next(OK);
        }).catch((e) => {
            this.logerror("Failed to queue to kafka:", e);
            return next();
        });
    });
}

exports.init_producer = function () {
    const cfg = this.config.get("kafka.ini").main;

    const clientId = cfg.clientId || "haraka";
    const brokers = cfg.brokers.split(",");
    this.topic = cfg.topic;
    this.timeout = parseInt(cfg.timeout) || 30000;

    const kafka = new Kafka({
        clientId,
        brokers,
        ssl: true,
        sasl: {
            mechanism: cfg.mechanism,
            username: cfg.username,
            password: cfg.password,
        },
        connectionTimeout: 10000,
        logLevel: logLevel.INFO,
    });

    this.producer = kafka.producer();
    this.producer.connect();
}

exports.shutdown = function () {
    this.producer.disconnect();
}