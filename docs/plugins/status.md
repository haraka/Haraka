# Status

This plugin allows to get internal status of queues and pools with SMTP commands sent from localhost.

## Communication

- **Request** &rarr; `STATUS <CMD> [param1] [param2]....`
- **Response** &larr; _&lt;SMTP code 211 or 500>&lt;space>&lt;json encoded response>\r\n_

### Example

```
< 220 example.com ESMTP Haraka ready
> STATUS QUEUE LIST
< 211 {"delivery_queue":[],"temp_fail_queue":[]}
```

## Available commands list

- `STATUS POOL LIST` - list of active pools
- `STATUS QUEUE STATS` - queue statistics in format "<in_progress>/<delivery_queue length>/<temp_fail_queue length>"
- `STATUS QUEUE LIST` - list of parsed queue files with _uuid, domain, mail_from, rcpt_to_ attributes
- `STATUS QUEUE INSPECT` - returns content of _outbound.delivery_queue_ and _outbound.temp_fail_queue_
- `STATUS QUEUE DISCARD file` - stop delivering email file
- `STATUS QUEUE PUSH file` - try to re-deliver email immediately
