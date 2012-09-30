var config = exports.config;
var config_data = config.get('outbound_limit.json', 'json');
var control = require('./plugins/rate_control/policy');
var constants = require('./constants');
var spam_pattern = /spam/ig

exports.register = function() {
    this.register_hook('limit', 'func_limit');
    this.register_hook('delivered', 'func_delivered');
    this.register_hook('bounce', 'func_bounce');
}

exports.func_limit = function(next, plugin, params) {
    var file = params[0];
    var domain = file.split('@')[1];
    var policy = control.getPolicy(domain);
    var exceeded = policy.exceed_limit(file, domain);
    if (exceeded) {
	next(constants.cont, plugin, params);
    }
    else {
	policy.prepose();
	next(constants.ok, plugin, params);
    }
}

// email successfully delivered
exports.func_delivered = function(next, hmail, params) {
    // before jump tp another plugin, do something here
    // if you want. e.g: do some logging
    next();
}


exports.func_bounce = function(next, hmail, err) {    
    // set plugin return value according to the remote
    // mail server response
    if (spam_pattern.test(err)) {
	return next(constants.spam, err);
    }
    var domain = hmail.todo.domain;
    switch(domain) {
    case 'yahoo.com':
    case 'yahoo.com.tw':
	if (err.indexOf('delivery error') != -1)
	    return next(constants.invalid, err);
	if (err.indexOf('This user doesn\'t have a yahoo') != -1)
	    return next(constants.invalid, err);
	break;
    case 'gmail.com':
	if (err.indexOf('http://support.google.com/mail/bin/answer.py?answer=6596') != -1)
	    return next(constants.invalid, err);
	break;
        /**
         * TODO: collect more ESP invalid user information
         */
    default:
	return next(constants.not_send, err);
    }
    return next(constants.not_send, err);
}
