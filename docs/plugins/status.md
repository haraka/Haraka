# Status

This plugin allows to get internal status of queues and pools with SMTP commands sent from localhost.  

## Communication

- **Request** &rarr; `STATUS <CMD> [param1] [param2]....`
- **Response** &larr; *&lt;SMTP code 211 or 500>&lt;space>&lt;json encoded response>\r\n*

### Example
```
< 220 example.com ESMTP Haraka ready
> STATUS QUEUE LIST
< 211 {"delivery_queue":[],"temp_fail_queue":[]}
```

## Available commands list

* `STATUS POOL LIST` - list of active pools
* `STATUS QUEUE STATS` - queue statistics in format "<in_progress>/<delivery_queue length>/<temp_fail_queue length>" 
* `STATUS QUEUE LIST` - list of parsed queue files with *uuid, domain, mail_from, rcpt_to* attributes
* `STATUS QUEUE INSPECT` - returns content of *outbound.delivery_queue* and *outbound.temp_fail_queue*
* `STATUS QUEUE DISCARD file` - stop delivering email file
* `STATUS QUEUE PUSH file` - try to re-deliver email immediately 
