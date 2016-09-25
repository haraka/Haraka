queue/qmail-queue
=================

This plugin delivers the mail to the `qmail-queue` program, which can be used
for both inbound and outbound delivery.

Configuration
-------------

* qmail-queue.path

  The path to the `qmail-queue` binary. Default: `/var/qmail/bin/qmail-queue`

* qmail-queue.ini

    * enable_outbound=true

      Deliver outbound email to qmail. Set to false to use Haraka's
      separate Outbound mail routing (MX based delivery)).
