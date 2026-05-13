# toobusy

This plugin will stop Haraka accepting new connections when the event loop
latency is too high.

See https://github.com/STRML/node-toobusy for details.

To use this plugin you must install the [`toobusy-js`](https://www.npmjs.com/package/toobusy-js)
module — it is not bundled with Haraka. From your Haraka install
directory:

```sh
npm install toobusy-js
```

This plugin registers on the `connect` hook with priority `-100`, so it
runs ahead of other `connect`/`lookup_rdns` plugins. Listing it near the
top of `config/plugins` is still a good idea for clarity.

## Configuration

If you wish to override the default maxLag value of 70ms then add the desired
value to config/toobusy.maxlag. This can be set and changed at runtime and
no restart is required.

Note that if you set the maxLag value to <10 then this will cause the toobusy
module to raise an exception which will cause Haraka to stop.
