var config = exports.config;
var constants = require('./constants');
var policy_factory = require('./plugins/outbound_control/rate_policy');

/**
 * outbound rate limit checker
 */
exports.register = function() {
    this.register_hook('check_limit', 'limit_checker');
}

exports.limit_checker = function(next, param) {
    var hmail = param;
    var domain = hmail._domain;
    var policy = policy_factory.get_policy(domain);
    var exceeded = policy.exceed_limit(hmail);
    if (exceeded) {
        next(constants.cont, param);
    }
    else {
	policy.prepose();
        next(constants.ok, param);
    }
}