
# 2016.01.21

* smtp\_proxy & qmail-queue: default to enabled for outbound deliveries
  (previously used Outbound), to better matches user expectations. To get
  previous behavior, add a config file with `enable_outbound=false`. 


# 2013.12.27

* new plugin: data.headers
    * deprecates data.rfc5322_header_checks.js
    * deprecates data.noreceived.js
    * deprecates data.nomsgid.js

