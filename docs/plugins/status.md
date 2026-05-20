# Status

This plugin allows to get internal status of queues and pools with SMTP commands sent from localhost.

## Communication

- **Request** &rarr; `STATUS <CMD> [param1] [param2]....`
- **Response** &larr; _&lt;SMTP code 211 or 500>&lt;space>&lt;json encoded response>\r\n_

### Example

```
< 220 example.com ESMTP Haraka ready
> STATUS QUEUE INSPECT
< 211 {"delivery_queue":[],"temp_fail_queue":[]}
```

## Available commands list

- `STATUS POOL LIST` - map of active outbound connection pools, keyed by `host:port`
- `STATUS QUEUE STATS` - queue statistics in format `"<in_progress>/<delivery_queue length>/<temp_fail_queue length>"`
- `STATUS QUEUE LIST` - list of queue files on disk with _uuid, domain, mail_from, rcpt_to_ attributes
- `STATUS QUEUE INSPECT` - returns merged content of `outbound.delivery_queue` and `outbound.temp_fail_queue` across all workers
- `STATUS QUEUE DISCARD file` - stop delivering email file
- `STATUS QUEUE PUSH file` - try to re-deliver email immediately

## Notes

### Live data only

`POOL LIST`, `QUEUE STATS`, and `QUEUE INSPECT` reflect live in-memory state. They show only messages currently being processed or waiting in the retry queue. `QUEUE LIST` reads queue files from disk and may show messages that have already been delivered if they haven't been cleaned up yet.

### Cluster mode

In cluster mode, `POOL LIST`, `QUEUE STATS`, and `QUEUE INSPECT` aggregate results from all worker processes into a single response:

- `POOL LIST` — pool maps from all workers are merged into one object
- `QUEUE STATS` — counters from all workers are summed into a single `"N/N/N"` string
- `QUEUE INSPECT` — `delivery_queue` and `temp_fail_queue` arrays from all workers are concatenated

`QUEUE LIST` always runs on the master process since it reads shared queue files from disk.
