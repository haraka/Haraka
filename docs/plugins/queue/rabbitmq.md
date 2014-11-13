queue/rabbitmq
========

This plugin delivers mails to rabbitmq queue for further processing.

Configuration
-------------

* `config/rabbitmq.ini`
    This config file provides server address and port of rabbitmq server to deliver with other configs of queues and exchange.
    
    Example:

    
        [rabbitmq]
        ; This is name of exchange.
        exchangeName  = emailMessages
        ; ip and port of the server.
        server_ip = localhost
        server_port = 5672
        ; name of the queue which reader will read
        queueName = email
        ; This is for making it persistant while publishing message
        deliveryMode = 2
        ; If true it will require ack for marking it complete from worker
        confirm = true
        ; Again for persistance passed while creating queue
        durable = true
        ; if true will delete queue if publisher quits
        autoDelete = false
        ; type of the exchange
        exchangeType = direct
    
 More information about rabbitmq can be found at https://www.rabbitmq.com/
