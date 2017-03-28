queue/rabbitmq_amqplib
======================

This plugin delivers emails to RabbitMQ queue for further processing. Based on `queue/rabbitmq` but using `amqplib`.

Dependency
----------
* `amqplib` - https://github.com/squaremo/amqp.node

Configuration
-------------

* `config/rabbitmq.ini` - Connection, exchange and queue settings
    
    Example:

    
        [rabbitmq]
        ; Connection
		host = localhost
		port = 5672
		;Virtual Host. Start with "/". Leave blank or not use if you don't want to use virtual hosts.
		vhost = /haraka
		;Credentials
		user = guest
		password = guest
		; Exchange
		exchangeName  = email_messages
		exchangeType = direct
		; Queue
		queueName = emails
		deliveryMode = 2
		confirm = true
		durable = true
		autoDelete = false

    
 More information about RabbitMQ can be found at https://www.rabbitmq.com/
