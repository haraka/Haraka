queue/rabbitmq\_amqplib
======================

This plugin delivers emails to RabbitMQ queue for further processing. Based on `queue/rabbitmq_ampqlib` but will route to different RabbitMQ Queues based on rcpt\_to.

queueRCTPReaplce is an array of and array of 2 strings, the first is a RegExp that will be wrapped with "^regex$" and matched with each rctp\_to. This gives a list of queue names. The email will be delivered to each one once.

Dependency
----------
* `amqplib` - https://github.com/squaremo/amqp.node

Configuration
-------------

* `config/rabbitmq_amqplib_queue.json` - Connection, exchange and queue settings
    
    Example:
```
    {
        "host":"localhost",
        "port":5672,
        "user":"smtpserver",
        "password":"smtpserver",
        "exchangeName":"email_messages",
        "exchangeType":"direct",
        "queueRCPTReplace":[["<.*@(.*).local>","$1"]],
        "deliveryMode":"2",
        "confirm":true,
        "durable":true,
        "autoDelete":false
    }
```

    
 More information about RabbitMQ can be found at https://www.rabbitmq.com/
