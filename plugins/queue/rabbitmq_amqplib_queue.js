// queue/rabbitmq_amqplib

var amqp = require("amqplib/callback_api");

var channel;
var deliveryMode;
var logger = require('./logger');
var queueRCPTReplace;

exports.register = function () {
    this.init_amqp_connection();
};

exports.hook_queue = function(next, connection) {

    var queues;
    var rctp_to = connection.trasaction.rcpt_to.length;
    var lq = queueRCPTReplace.length;
    var lr = rcpt_to.length;
    for (var i = 0; i < lq; i++) {
        for (var j = 0; j <lr; j++) {
            if (rctp_to[j].match(queueRCPTReplace[i][0])) {
                queues[rctp_to[j].replace(queueRCPTReplace[i][0],queueRCPTReplace[i][1])] = true;
            };
        };
    };

    var sent = false;

    var send_message = function(queue) {
        connection.transaction.message_stream.get_data(function(str) {
            sent = sent && (channel.sendToQueue(queue, new Buffer(str), {deliveryMode: deliveryMode}))
        });
    };

    queues = queues.keys();
    var l = queues.length;
    for (var i = 0; i < l; i++) {
        channel.assertQueue(
	    queueName,
            {durable: durable, autoDelete: autoDelete},
	    function (err, ok) {if (!err) send_message(ok.queue);}
	);
    };

    if (sent) {
        return next(OK);
    } else {
        return next();
    };
};

exports.init_amqp_connection = function() {
    var cfg = this.config.get("rabbitmq_amqplib_queue.json");

    var host = cfg.host || "127.0.0.1";
    var port = cfg.port || "5672";
    var user = cfg.user || "guest";
    var password = cfg.password || "guest";
    var exchangeName = cfg.exchangeName || "emailMessages";
    var exchangeType = cfg.exchangeType || "direct";
    var durable = cfg.durable === "true" || true;
    // var confirm = cfg.confirm === "true" || true;
    var autoDelete = cfg.autoDelete === "true" || false;
    queueRCPTReplace = cfg.queueRCPTReplace || [[".*","emails"]];
    var l = queueRCPTReplace.length;
    for (var i = 0; i < l; i ++) {
        queueRCPTReplace[i][0] = new Regexp("^" +  queueRCPTReplace[i][0] + "$");
    };

    deliveryMode = cfg.deliveryMode || 2;

    amqp.connect("amqp://"+user+":"+password+"@"+host+":"+port, function(err, conn){
        if (err)
            return conn.close();
        // TODO: if !confirm conn.createChannel...
        conn.createConfirmChannel(function (err, ch) {
            if (err) return conn.close();
            ch.assertExchange(exchangeName, exchangeType, {durable: durable}, function(err, ok){
                if (err) return conn.close();
                channel = ch;
            });
        });
    });
};
