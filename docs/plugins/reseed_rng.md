# reseed_rng

Reseeds `Math.random()` in each cluster worker at start-up using
`crypto.randomBytes(256)`. Without this, workers forked at nearly the
same time can end up with correlated PRNG state, which can produce
UUID collisions and other "this should be impossible" bugs.

The plugin relies on [seedrandom](https://www.npmjs.com/package/seedrandom)
being loaded so that `Math.seedrandom()` is available.

Anyone running with `nodes=...` in `smtp.ini` (i.e. cluster mode) should
consider enabling this plugin.

## Configuration

No configuration.
