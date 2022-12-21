const crypto = require('crypto');

exports.hook_init_child = function (next) {
    Math.seedrandom(crypto.randomBytes(256).toString('hex'));
    this.logdebug("reseeded rng");
    next();
}
