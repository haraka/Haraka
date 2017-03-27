// queue/rabbitmq_coffee

//node.coffee
AMQP = require('amqp-coffee')

//message to publish
//msg = "Hello CloudAMQP"

exports.init_amqp_connection = function () {
    var plugin = this;
    var cfg = this.config.get("rabbitmq.ini").rabbitmq;

    var chost = cfg.host || "127.0.0.1";
    var cport = cfg.port || "5672";
    var cvhost = cfg.vhost || "";
    var cuser = cfg.user || "guest";
    var cpassword = cfg.password || "guest";
    var cexchangeName = cfg.exchangeName || "emailMessages";
    var cexchangeType = cfg.exchangeType || "amq.direct";
    var cqueueName = cfg.queueName || "emails";
    var cdurable = cfg.durable === "true" || true;
    // var confirm = cfg.confirm === "true" || true;
    var cautoDelete = cfg.autoDelete === "true" || false;
    deliveryMode = cfg.deliveryMode || 2;


//Creates a new amqp Connection.
amqpConnection = new AMQP {host: chost, port:cport, vhost: cvhost, login: cuser, password: cpassword}, (e, r)->
  if e?
    console.error "Error", e

  //Returns a channel that can be used to handle (declare, delete etc) queues.
  amqpConnection.queue {queue: cqueueName}, (e,q)->
    q.declare ()->
      q.bind cexchangeType, cqueueName, ()->
      amqpConnection.publish cexchangeType, cqueueName, msg, {confirm: true}, (err, res)->
      console.log "Message published: " + msg

   // consumer = amqpConnection.consume cqueueName, {prefetchCount: 2}, (message)->
  //    console.log("Message consumed: " + message.data.toString())
   //   message.ack()
//
//    , (e,r)->
//      console.log "Consumer setup"
      amqpConnection.publish cexchangeType, cqueueName, "message contents", {deliveryMode:2, confirm:true}, (e, r)->
        if !e? then console.log "Message Sent"






//var amqp = require("amqplib/callback_api");

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

//exports.init_amqp_connection = function () {
//    var plugin = this;
//    var cfg = this.config.get("rabbitmq.ini").rabbitmq;

//    var host = cfg.host || "127.0.0.1";
//    var port = cfg.port || "5672";
//    var vhost = cfg.vhost || "";
//    var user = cfg.user || "guest";
//    var password = cfg.password || "guest";
//    var exchangeName = cfg.exchangeName || "emailMessages";
//    var exchangeType = cfg.exchangeType || "direct";
//    var queueName = cfg.queueName || "emails";
//    var durable = cfg.durable === "true" || true;
    // var confirm = cfg.confirm === "true" || true;
//    var autoDelete = cfg.autoDelete === "true" || false;
//    deliveryMode = cfg.deliveryMode || 2;

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
