# queue/rabbitmq_amqplib

This plugin delivers emails to RabbitMQ queue for further processing. Based on `queue/rabbitmq` but using `amqplib`.

## Dependency

- `amqplib` - https://github.com/squaremo/amqp.node

## Configuration

- `config/rabbitmq.ini` - Connection, exchange and queue settings

  Example:

        [rabbitmq]
        ; Connection
      ; Protocol. Either "amqp" or "amqps"
      protocol = amqp
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
      confirm = true
      durable = true
      autoDelete = false
      ; Message
      deliveryMode = 2
      priority = 1

      ; Optional exchange arguments
      ; More information about exchange x-arguments can be found at https://www.rabbitmq.com/docs/exchanges#optional-arguments
      [exchange_args]
      alternate-exchange =

      ; Optional queue arguments
      ; More information about queue x-arguments can be found at https://www.rabbitmq.com/queues.html#optional-arguments
      [queue_args]
      x-dead-letter-exchange =
      x-dead-letter-routing-key = emails_dlq
      x-overflow = reject-publish
      x-queue-type = quorum

More information about RabbitMQ can be found at https://www.rabbitmq.com/
