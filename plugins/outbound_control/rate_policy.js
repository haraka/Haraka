var util   = require("util");
var events = require("events")
var config = require("../../config")
var config_data = config.get('outbound_limit.json', 'json');
var delivery_concurrency = 0;
var conn_pool = {};
var policies = {};


function get_policy(domain) {
    if (!policies[domain]) {	
	policies[domain]  = new Policy(domain);
    }
    return policies[domain];
}

function get_ISPConfig(dom, name) {
    var data = config_data[dom];
    if (!data)
	data = config_data['default'];    
    return data[name];
}

function Policy(dom) {    
    this.domain = dom;
    // this.frozen_ts = -128000;

    var data = config_data[dom];
    if (!data)
	data = config_data['default'];

    this.cur_conn = 0;
    this.conn_limit  = data['conn_limit'];    

    this.micro_deliveries = 0;
    this.micro_limit = data['micro_limit'];
    
    this.tiny_deliveries = 0;
    this.tiny_limit = data['tiny_limit'];
    
    this.medium_deliveries = 0;    
    this.medium_limit = data['medium_limit'];

    this.big_deliveries = 0;
    this.big_limit = data['big_limit'];    

    this.MICRO = data['micro'];        
    this.TINY = data['tiny'];
    this.MEDIUM = data['medium'];
    this.BIG = data['big'];

    // initialize three timestamps
    this.tiny_timestamp =  this.medium_timestamp 
	= this.big_timestamp = new Date().getTime();
}

Policy.prototype.exceed_limit = function() 
{
    // check if we are over connection limit
    if (this.cur_conn > this.conn_limit)
	return true;

    var cur_time = new Date().getTime();

    // if (cur_time - this.frozen_ts < 64 * 1000)
    //     return true;

    var exceed_micro_limit = false,
    exceed_tiny_limit = false,
    exceed_medium_limit = false,
    exceed_big_limit = false;    

    // check if we are over daily limit
    if (cur_time - this.big_timestamp < this.BIG) {
	if (this.big_deliveries >= this.big_limit)
	    exceed_big_limit = true;
    }
    else {
	this.big_timestamp = cur_time;
	this.big_deliveries = 0;
	this.conn_tries = 0;
    }    
    if (exceed_big_limit)
	return true;

    // check if we are over hourly limit
    if (cur_time - this.medium_timestamp < this.MEDIUM) {
	if (this.medium_deliveries > this.medium_limit)
	    exceed_medium_limit = true;
    }
    else {
	this.medium_timestamp = cur_time;
	this.medium_deliveries = 0;
    }
    if (exceed_medium_limit)
	return true;

    // check if we are over minute limit
    if (cur_time - this.tiny_timestamp < this.TINY) {
	if (this.tiny_deliveries >= this.tiny_limit)
	    exceed_tiny_limit = true;
    }
    else {
	this.tiny_timestamp = cur_time;
	this.tiny_deliveries = 0;
    }

    if (exceed_tiny_limit)
	return true;

    if (cur_time - this.micro_timestamp < this.MICRO) {
    	if (this.micro_deliveries >= this.micro_limit)
    	    exceed_micro_limit = true;
    }
    else {
    	this.micro_timestamp = cur_time;
    	this.micro_deliveries = 0;
    }
    
    if (exceed_micro_limit)
    	return true;
    
    return false;
}

// Policy.prototype.freeze = function() {
//     this.frozen_ts = new Date().getTime();
// }

Policy.prototype.dispose = function(delivered, not_send) {   
    delivery_concurrency--;
    this.cur_conn--;
}

Policy.prototype.prepose = function() {
    delivery_concurrency++;
    this.cur_conn++;
    this.micro_deliveries++;
    this.tiny_deliveries++;
    this.medium_deliveries++;
    this.big_deliveries++;
}

exports.get_policy = get_policy;
exports.policies = policies;
exports.get_ISPConfig = get_ISPConfig;
exports.delivery_concurrency = delivery_concurrency;
exports.conn_pool = conn_pool;
// exports.tracked_deliveries = tracked_deliveries;
