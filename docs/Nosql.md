# nosql.js

Store stuff in memory-backed objects, smartly.

## Usage

    var nosql = require('./nosql');

Includes the following functions:

## set

    nosql.set('foo', 'bar', function (err, result) {
        if (err) {
            // error handling code
            return;
        }
        // do fun stuff with result
    });

You're confident it'll work out?  Skip the callback, it's optional. For all of these methods.

    nosql.set('foo', 'bar');  // going commando

## get

    nosql.get('foo', function (err, result) {
        if (err) { return; }
        // result == 'bar'  (because that's what we set it to)
    });

## del

    nosql.del('foo', function (err, result) {
        if (err) { return; }
        // result == 1   (# of objects keys deleted)
    });

## incrby

    nosql.incrby('my_counter', 1, function (err, result) {
        if (err) { return; }
        // result == 1  (it was undef, now it's initialized to 1)
    });

    nosql.incrby('my_counter', 2);  // breezy!
    // now my_counter == 3   (increment 1 with 2 and math!)


## reset

    nosql.reset();

    // all your keys are belong to /dev/null


# RAM? That ain't workin'

## Pros

* simple
* no dependencies

## Cons

* Data disappears when Haraka is restarted.
* Not shared across hosts
* With [cluster](https://nodejs.org/api/cluster.html), worker processes share no data. Therefore, each worker process has a partial (incomplete) view of the state data.

# Cluster RAM

* When running with cluster, `nosql` attempts to load [strong-store-cluster](http://apidocs.strongloop.com/strong-store-cluster/), which stores data in the master worker.

## Pros

* All Haraka processes share a single RAM backed data store.

## Cons

* There's no "reset" operation. Instead, keys expire after 10 minutes (edit
  `config/nosql.ini [cluster]expire` to alter. This is great for features such
  as concurrency or brute-force auth tracking.

# Redis

## Pros

* disk backed RAM storage
* same view across Harka master & worker processes
* persistence across Haraka & server reboots
* network service, can be shared by many hosts

## Enable Redis

    sed -i.bak -e 's/; backend=redis/backend=redis/' /my/haraka/config/nosql.ini


### Redis isn't running on localhost!

    $EDITOR config/nosql.ini

Edit the settings in the [redis] section.

### I need more Redis features

When Redis is configured, the redis connection is exported as `nosql.redis`. Use it like so:

    var nosql = require('./nosql');
    var redis = nosql.redis;

    redis.multi()
         .hget('something')
         .get('else')
         .exec(function (err, res) {
         });

Refer to the excellent [Redis command docs](http://redis.io/commands)


# Other

## What about key collisions?

Collisions are only possible within your namespace. Each caller of `nosql` automatically gets its own namespace. In RAM, each namespace is a JS object, rather like this:

    {
        karma: {
            key: val,
            key2: val2,
        },
        limit: {
            key: val,
            key2: val2,
        }
    }

In Strong Store Cluster, each caller gets its own collection.

In Redis, get|del|incrby operations are mapped to their hash equivalents (hget, hdel, hincrby).

