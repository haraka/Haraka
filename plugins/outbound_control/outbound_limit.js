var config = exports.config;
var constants = require('./constants');
var policy_factory = require('./plugins/outbound_control/rate_policy');

exports.register = function() {
    this.register_hook('limit', 'limit_checker');
}

exports.limit_checker = function(next, param) {
    var hmail = param;
    var domain = hmail._domain;
    var policy = policy_factory.get_policy(domain);
    var exceeded = policy.exceed_limit(hmail);
    hmail.loginfo("kslfklsjfklasj");
    if (!exceeded) {
        hmail.loginfo("超了吵了@@@@@！！！！！！............");
        next(constants.cont, param);
    }
    else {
        hmail.loginfo(policy);
        hmail.loginfo("liang li 是个小瘪三！！");
        policy.prepose();
        next(constants.ok, param);
    }
}
