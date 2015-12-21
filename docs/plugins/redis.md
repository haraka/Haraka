# redis

Connects to a local (by default) redis instance and stores a `redis`
connection handle at `server.notes.redis`. 

## Config

The `redis.ini` file has two sections (defaults shown):

### [server]

    ; host=127.0.0.1
    ; port=6379
    ; db=0

### [redisOpts]

    ; see https://www.npmjs.com/package/redis#overloading


## Usage

Use redis in your plugin like so:

    if (server.notes.redis) {
        server.notes.redis.hgetall(...);
        server.notes.redis.publish(...);
            // or any other redis command
    }

