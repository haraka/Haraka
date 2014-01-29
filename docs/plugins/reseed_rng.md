reseed\_rng
==========

The V8 that ships with node 0.4.x uses an unsophisticated method of
seeding its random number generator- it simply uses the current time
in ms.  Worse, that version of V8 (at least) doesn't provide a way
to explicitly reseed the RNG.

In situations where multiple processes can spawn in the same
ms, processes can be seeded with the same value, leading to bad 
problems like UUID collisions. When using the 'cluster' module, it's
quite easy to observe this behavior. 

This plugin uses David Bao's reseed.js (see http://davidbau.com/archives/2010/01/30/random_seeds_coded_hints_and_quintillions.html)
to provide a reseedable Math.random(), and hooks the init\_child event
to reseed the RNG with a sligtly better seed at spawned-process startup
time. 

All users of the 'cluster' module should consider using this plugin.
