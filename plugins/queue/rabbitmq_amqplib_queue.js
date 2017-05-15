// queue/rabbitmq_amqplib

var amqp = require("amqplib/callback_api");

var channel;
var deliveryMode;
var logger = require('./logger');
var queueRCPTReplace;
var durable;
var autoDelete;

var async = require('async');

exports.register = function () {
    this.init_amqp_connection();
    //this.register_hook('queue','hook_queue');
};

exports.hook_data = function (next, connection) {
    connection.transaction.parse_body = 1;
    next();
}

exports.hook_queue_outbound = function(next, connection) {

    var queues = {};
    var rcpt_to = connection.transaction.rcpt_to;
    var lq = queueRCPTReplace.length;
    var lr = rcpt_to.length;
    for (var i = 0; i < lq; i++) {
        for (var j = 0; j <lr; j++) {
            if (rcpt_to[j].original.match(queueRCPTReplace[i][0])) {
                queues[rcpt_to[j].original.replace(queueRCPTReplace[i][0],queueRCPTReplace[i][1])] = true;
            };
        };
    };

    var send_message = function(queue) {
        var message = JSON.stringify(connection.transaction.body);
        message = new Buffer(message);
        return channel.sendToQueue(queue, message, {deliveryMode: deliveryMode});
    };

    async.forEachOf(queues,function(item,key,callback) {
        channel.assertQueue(
	    key,
            {durable: durable, autoDelete: autoDelete},
	    function (err, ok) {
	        if (err) {
		    callback(err);
		} else {
		    if (send_message(ok.queue)) {
		        callback();
                    } else {
                        callback("RabbitMQ Queue Falied");
                   };
		}
	    }
	);
    },function(err) {
        if (err) {
            next();
        } else {
            next(OK);
        };
    });
};

exports.init_amqp_connection = function() {
    var cfg = this.config.get("rabbitmq_amqplib_queue.json");

    var host = cfg.host || "127.0.0.1";
    var port = cfg.port || "5672";
    var user = cfg.user || "guest";
    var password = cfg.password || "guest";
    var exchangeName = cfg.exchangeName || "emailMessages";
    var exchangeType = cfg.exchangeType || "direct";
    // var confirm = cfg.confirm === "true" || true;

    autoDelete = cfg.autoDelete === "true" || false;
    durable = cfg.durable === "true" || true;
    queueRCPTReplace = cfg.queueRCPTReplace || [[".*","emails"]];
    var l = queueRCPTReplace.length;
    for (var i = 0; i < l; i ++) {
        queueRCPTReplace[i][0] = new RegExp("^" +  queueRCPTReplace[i][0] + "$");
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
