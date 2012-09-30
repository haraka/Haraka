"use strict";
var fs          = require('fs');
var path        = require('path');
var dns         = require('dns');
var net         = require('net');
var util        = require("util");
var events      = require("events");
var utils       = require('../utils');
var sock        = require('../line_socket');
var server      = require('../server');
var logger      = require('../logger');
var config      = require('../config');
var constants   = require('../constants');
var trans       = require('../transaction');
var plugins     = require('../plugins');
var date_to_str = require('../utils').date_to_str;
var Address     = require('../address').Address;
var control     = require('./policy');
var sendcloud   = require('./sendcloud');
var Queue       = require('./queue').Queue;
var conn_pool   = control.conn_pool;

var core_consts = require('constants');
var WRITE_EXCL  = core_consts.O_CREAT | core_consts.O_TRUNC |
    core_consts.O_WRONLY | core_consts.O_EXCL;

var DENY = constants.deny;
var OK   = constants.ok;

var MAX_UNIQ = 10000;
var host = require('os').hostname().replace(/\\/, '\\057').replace(/:/, '\\072');
var fn_re = /^(\d+)_(\d+)_/; // I like how this looks like a person

var queue_dir = path.resolve(config.get('queue_dir') || (process.env.HARAKA + '/queue'));
exports.queue_dir = queue_dir;

var uniq = Math.round(Math.random() * MAX_UNIQ);
var max_concurrency = config.get('outbound.concurrency_max') || 50;
var queue_count = 0;
var socket_id  = 0;
var processing_queue = new Queue();
exports.processing_queue = processing_queue;

exports.list_queue = function () {
    this._load_cur_queue("_list_file");
}

exports.stat_queue = function () {
    this._load_cur_queue("_stat_file");
    return this.stats();
}

exports.load_queue = function () {
    // Initialise and load queue
    console.log('loading from queue....');

    // we create the dir here because this is used when Haraka is running
    // properly.

    // no reason not to do this stuff syncronously - we're just loading here
    if (!path.existsSync(queue_dir)) {
        this.logdebug("Creating queue directory " + queue_dir);
        try {
            fs.mkdirSync(queue_dir, 493); // 493 == 0755
        }
        catch (err) {
            if (err.code != 'EEXIST') {
                throw err;
            }
        }
    }

    this._load_cur_queue("_add_file");
}

function _next_uniq () {
    var result = uniq++;
    if (uniq >= MAX_UNIQ) {
        uniq = 1;
    }
    return result;
}

function _fname () {
    var time = new Date().getTime();
    return time + '_0_' + process.pid + "_" + _next_uniq() + '.' + host;
}

exports.build_todo = function (todo, ws, write_more) {
    // Replacer function to exclude items from the queue file header
    function exclude_from_json(key, value) {
        switch (key) {
        case 'data_lines':
            return undefined;
        default:
            return value;
        }
    }
    var todo_str = JSON.stringify(todo, exclude_from_json);    
    
    // since JS has no pack() we have to manually write the bytes of a long
    var todo_length = new Buffer(4);
    var todo_l = todo_str.length;
    todo_length[3] = todo_str.length & 0xff;
    todo_length[2] = (todo_str.length >> 8) & 0xff;
    todo_length[1] = (todo_str.length >> 16) & 0xff;
    todo_length[0] = (todo_str.length >> 24) & 0xff;
    
    ws.write(todo_length);
    if (ws.write(todo_str)) {
        // if write() above returned false, the 'drain' event will be called
        // later anyway to call write_more_data()
        write_more();
    }
}

exports.split_to_new_recipients = function (hmail, recipients) {
    var plugin = this;
    var fname = _fname() + '@' + hmail.todo.domain;
    var tmp_path = path.join(queue_dir, '.' + fname);
    var ws = fs.createWriteStream(tmp_path, { flags: WRITE_EXCL });

    var writing = false;

    var write_more = function () {
        if (writing) return;
        writing = true;
        var rs = hmail.data_stream();
        rs.pipe(ws, {end: false});
        rs.on('error', function (err) {
            plugin.logerror("Reading original mail error: " + err);
        })
        rs.on('end', function () {
            // rs.destroy();

            hmail.delivered();
            ws.on('close', function () {
                var dest_path = path.join(queue_dir, fname);
                fs.rename(tmp_path, dest_path, function (err) {
                    if (err) {
                        plugin.logerror("Unable to rename tmp file!: " + err);
			hmail.requeue_error(hmail, tmp_path, err);
                    }
                    else {
                        var split_mail = new HMailItem (fname, dest_path);
                        split_mail.on('ready', function () {
                            split_mail.temp_fail("Split into multiple recipients");
                        });
                    }
                });
            });
            ws.destroySoon();
            return;
        });
    }

    ws.on('error', function (err) {
        plugin.logerror("Unable to write queue file (" + fname + "): " + err);
        ws.destroy();
        hmail.bounce("Error re-queueing some recipients");
    });

    ws.on('drain', write_more);

    hmail.todo.rcpt_to = recipients;
    plugin.build_todo(hmail.todo, ws, write_more);
}

exports._load_cur_queue = function (cb_name, reverse) {
    var plugin = this;
    fs.readdir(queue_dir, function (err, files) {
        if (err) {
            return plugin.logerror("Failed to load queue directory ("
                                   + queue_dir + "): " + err);
        }
	
	files.sort();
	if (reverse)
	    files.reverse()

	for (var i = 0; i < files.length; ++i) {	    
	    var file = files[i];
	    if (/^\./.test(file)) {
		// dot-file...
		continue;
	    }
	    var domain = file.split('@')[1];
	    if (!control.tracked_deliveries[file]) {
		if (path.existsSync(plugin.queue_dir + '/' + file)) {
		    control.tracked_deliveries[file] = true;		
		    processing_queue.push(domain, file);
		}
	    }
	    else
		continue;    	    
	}
        
        plugin.cur_time = new Date();
        plugin.load_queue_files(cb_name, processing_queue);
    })	      
}


exports.load_queue_files = function (cb_name, files) {
    var plugin = this;
    if ((control.delivery_concurrency >= max_concurrency)
        || config.get('outbound.disabled'))
    {
        // try again in 1 second if delivery is disabled
        setTimeout(function () {
            plugin.load_queue_files(cb_name, files)}, 1000);
        return;
    }
    
    var queue_size = processing_queue.size();
    for (var i=1; i <= max_concurrency; i++) {

	if (files.length === 0)
            break;
        
	var keys =  Object.keys(files.mails);
	var index = i % keys.length;
        var file = files.shift(index, keys);	
	var matches = file.match(fn_re);
	plugins.run_hooks('limit', plugin, [file, cb_name]);

        if (i === max_concurrency)
	    break;	  
    }
    var interval = processing_queue.size() > 20 ? 3000 : 1000;
    setTimeout(function() { plugin.load_queue(true)}, interval);
}

exports.limit_respond = function(retval, plugin, params) {
    var file = params[0];
    var domain = file.split('@')[1];
    if (retval === constants.ok) {
	var cb = params[1];
	var hmail = new HMailItem(file, path.join(plugin.queue_dir, file));
	plugin[cb](hmail);
    }
    else{
	plugin.processing_queue.push(domain, file);
    }
}

exports._add_file = function (hmail) {
    var self = this;
    this.loginfo("Adding file: " + hmail.filename);
    setTimeout(function () { hmail.send() }, 0);
}

exports._list_file = function (hmail) {
    // TODO: output more data here
    console.log("Q: " + hmail.filename);
}

exports._get_stats = function (hmail) {
    queue_count++;
}

exports.stats = function () {
    // TODO: output more data here
    var results = {
        queue_dir:   queue_dir,
        queue_count: queue_count,
    };

    return results;
}

// TODOItem - queue file header data
function TODOItem (domain, recipients, transaction) {
    this.domain = domain;
    this.rcpt_to = recipients;
    this.mail_from = transaction.mail_from;
    this.data_lines = transaction.data_lines;

    this.email_id = transaction.email_id;
    this.receiver = transaction.receiver;
    this.category = transaction.category;
    this.user_id = transaction.user_id;

    this.notes = transaction.notes;
    this.uuid = transaction.uuid;
    return this;
}

/////////////////////////////////////////////////////////////////////////////
// HMailItem - encapsulates an individual outbound mail item

function HMailItem (filename, path, notes) {
    events.EventEmitter.call(this);
    var matches = filename.match(fn_re);
    if (!matches) {
        throw new Error("Bad filename: " + filename);
    }    
    this.path         = path;
    this.filename     = filename;
    this.next_process = matches[1];
    this.num_failures = matches[2];
    this.notes        = notes || {};
    this.size_file();
}

util.inherits(HMailItem, events.EventEmitter);
exports.HMailItem = HMailItem;

// populate log functions - so we can use hooks
for (var key in logger) {
    if (key.match(/^log\w/)) {
        exports[key] = (function (key) {
	    return function () {
                var args = ["[outbound] "];
                for (var i=0, l=arguments.length; i<l; i++) {
		    args.push(arguments[i]);
                }
                logger[key].apply(logger, args);
	    }
        })(key);
        HMailItem.prototype[key] = (function (key) {
	    return function () {
                var args = [ this ];
                for (var i=0, l=arguments.length; i<l; i++) {
		    args.push(arguments[i]);
                }
                logger[key].apply(logger, args);
	    }
        })(key);
    }
}

HMailItem.prototype.data_stream = function () {
    return fs.createReadStream(this.path, {start: this.data_start, end: this.file_size});
}

HMailItem.prototype.size_file = function () {
    var self = this;
    fs.stat(self.path, function (err, stats) {
        if (err) {
	    // we are fucked... guess I need somewhere for this to go
	    delete control.tracked_deliveries[self.filename];
	    control.getPolicy(self.filename.split('@')[1]).dispose();
	    logger.logerror("Error obtaining file size: " + err);
        }
        else {
	    self.file_size = stats.size;
	    self.read_todo();
        }
    });
}

HMailItem.prototype.read_todo = function () {
    var self = this;
    var tl_reader = fs.createReadStream(self.path, {start: 0, end: 3});
    tl_reader.on('data', function (buf) {
        // I'm making the assumption here we won't ever read less than 4 bytes
        // as no filesystem on the planet should be that dumb...
        tl_reader.destroy();
        var todo_len = (buf[0] << 24) + (buf[1] << 16) + (buf[2] << 8) + buf[3];
        var td_reader = fs.createReadStream(self.path, {encoding: 'utf8',
                                                        start: 4,
                                                        end: todo_len + 3});
        self.data_start = todo_len + 4;
        var todo = '';
        td_reader.on('data', function (str) {
	    todo += str;
	    if (todo.length === todo_len) {
                // we read everything
                todo = JSON.parse(todo);
                self.todo = todo;
                self.emit('ready');
	    }
        });
        td_reader.on('error', function (err) {
	    logger.logerror("Error reading todo: " + err);
        })
        td_reader.on('end', function () {
	    if (todo.length === todo_len) {
                logger.logerror("Didn't find enough data in todo!");
	    }
        })
    });
}

HMailItem.prototype.send = function () {
    if (!this.todo) {
        var self = this;
        this.on('ready', function () { self._send() });
    }
    else {
        this._send();
    }
}

HMailItem.prototype._send = function () {
    if ((control.delivery_concurrency >= max_concurrency)
        || config.get('outbound.disabled'))
    {
        // try again in 1 second if delivery is disabled
        this.logdebug("delivery disabled temporarily. Retrying in 1s.");
        var hmail = this;
        setTimeout(function () {hmail._send()}, 1000);
        return;
    }
    plugins.run_hooks('send_email', this);
}

HMailItem.prototype.send_email_respond = function (retval, delaySeconds) {
    if(retval === constants.delay){
        // Try again in 'delay' seconds.
        this.logdebug("Delivery delayed.");
        var hmail = this;
        setTimeout(function () {hmail._send()}, delaySeconds*1000);
    }else{
        this.logdebug("Sending mail: " + this.filename);
        this.get_mx();
    }
}

HMailItem.prototype.get_mx = function () {
    var from = this.todo.mail_from.original.replace('>','').replace('<','');
    plugins.run_hooks('get_mx', this, from);
}

HMailItem.prototype.get_mx_respond = function (retval, mx) {
    switch(retval) {
    case constants.ok:
        var mx_list;
        if (Array.isArray(mx)) {
	    mx_list = mx;
        }
        else if (typeof mx === "object") {
	    mx_list = [mx];
        }
        else {
	    // assume string
	    var matches = /^(.*)(:(\d+))?$/.exec(mx);
	    if (!matches) {
                throw("get_mx returned something that doesn't match hostname or hostname:port");
	    }
	    mx_list = [{priority: 0, exchange: matches[1], port: matches[3]}];
        }
        // this.logdebug("Got an MX from Plugin: " + this.todo.domain + " => 0 " + mx[0].exchange);
      	this.logdebug(mx_list);
        return this.found_mx(null, mx_list);
    case constants.deny:
        this.logwarn("get_mx plugin returned DENY: " + mx);
        return this.bounce("No MX for " + this.todo.domain);
    case constants.denysoft:
        this.logwarn("get_mx plugin returned DENYSOFT: " + mx);
        return this.temp_fail("Temporary MX lookup error for " + this.todo.domain);
    }

    // if none of the above return codes, drop through to this...

    var mxs = [];
    var hmail = this;
    
    // Possible DNS errors
    // NODATA
    // FORMERR
    // BADRESP
    // NOTFOUND
    // BADNAME
    // TIMEOUT
    // CONNREFUSED
    // NOMEM
    // DESTRUCTION
    // NOTIMP
    // EREFUSED
    // SERVFAIL
    
    // default wrap_mx just returns our object with "priority" and "exchange" keys
    var wrap_mx = function (a) { return a };
    var process_dns = function (err, addresses) {
        if (err) {
	    hmail.found_mx(err);
        }
        else if (addresses && addresses.length) {
	    for (var i=0,l=addresses.length; i < l; i++) {
                var mx = wrap_mx(addresses[i]);
                hmail.logdebug("Got an MX from DNS: " + hmail.todo.domain + " => " + mx.priority + " " + mx.exchange);
                mxs.push(mx);
	    }
	    hmail.found_mx(null, mxs);
        }
        else {
	    // return zero if we need to keep trying next option
	    return 0;
        }
        return 1;
    };
    
    dns.resolveMx(this.todo.domain, function(err, addresses) {
        if (process_dns(err, addresses)) {
	    return;
        }
        
        // if MX lookup failed, we lookup an A record. To do that we change
        // wrap_mx() to return same thing as resolveMx() does.
        wrap_mx = function (a) { return {priority:0,exchange:a} };

        dns.resolve(hmail.todo.domain, function(err, addresses) {
	    if (process_dns(err, addresses)) {
                return;
	    }
	    var err = new Error("Found nowhere to deliver to");
	    err.code = 'NOMX';
	    hmail.found_mx(err);
        });
    });
}

HMailItem.prototype.found_mx = function (err, mxs) {
    if (err) {
        this.logerror("MX Lookup for " + this.todo.domain + " failed: " + err);
        if (err.code === dns.NXDOMAIN || err.code === 'ENOTFOUND') {
	    this.fatal_fail('haraka: cannot found domain')
        }
        else if (err.code === 'NOMX') {
	    this.fatal_fail('haraka: nowhere to deliver for this domain');
        }
        else {
	    // every other error is transient
	    // this.temp_fail("DNS lookup failure: " + err);
	    this.fatal_fail("DNS lookup failure: " + err);
        }
    }
    else {
        var mxlist = sort_mx(mxs);
        this.mxlist = mxlist;
        this.try_deliver();
    }
}

// MXs must be sorted by priority order, but matched priorities must be
// randomly shuffled in that list, so this is a bit complex.
function sort_mx (mx_list) {
    var sorted = mx_list.sort(function (a,b) {
        return a.priority - b.priority;
    });
    
    // This isn't a very good shuffle but it'll do for now.
    for (var i=0,l=sorted.length-1; i<l; i++) {
        if (sorted[i].priority === sorted[i+1].priority) {
	    if (Math.round(Math.random())) { // 0 or 1
                var j = sorted[i];
                sorted[i] = sorted[i+1];
                sorted[i+1] = j;
	    }
        }        
    }
    return sorted;
}

HMailItem.prototype.try_deliver = function () {
    var self = this;
    // control.delivery_concurrency++;

    // check if there are any MXs left
    if (this.mxlist.length === 0) {
        return this.temp_fail("Tried all MXs");
    }
    
    var mx   = this.mxlist.shift();
    var host = mx.exchange;
    
    this.loginfo("Looking up A records for: " + host);

    if (net.isIP(host)) {
        self.hostlist = [ host ];
        return self.try_deliver_host(mx);
    }
    
    // now we have a host, we have to lookup the addresses for that host
    // and try each one in order they appear
    dns.resolve(host, function (err, addresses) {
        if (err) {
	    self.logerror("DNS lookup of " + host + " failed: " + err);
	    return self.try_deliver(); // try next MX
        }
        if (addresses.length === 0) {
	    // NODATA or empty host list
	    self.logerror("DNS lookup of " + host + " resulted in no data");
	    return self.try_deliver(); // try next MX
        }
        self.hostlist = addresses;
        self.try_deliver_host(mx);
    });
}

var smtp_regexp = /^([0-9]{3})([ -])(.*)/;

HMailItem.prototype.try_deliver_host = function (mx) {
    var filename = this.filename;

    if (this.hostlist.length === 0) {
        return this.try_deliver(); // try next MX
    }
    
    var domain = this.todo.domain;
    var host = this.hostlist.shift();    
    var port   = mx.port || 25;

    this.loginfo("Attempting to deliver to: " + host + " (" + control.delivery_concurrency + ")");   
    var from = this.todo.mail_from.original.replace('>','').replace('<','');
    var timeout = 60 * 1000;
    var enable_tls = false;
    var max = control.getEspConfig(domain, 'conn_limit');
    var hmail = this; 
    
    sendcloud.run_send(conn_pool, domain, port, host, timeout, enable_tls, max, hmail, 
		       function(err, send_client) {
			   if (err) {
			       hmail.not_send(constants.no);
	                       return;
		           }
			   // actually we only have one address for each mail
			   var rcpts = hmail.todo.rcpt_to
			   var send_rcpt = function () {
			       if (hmail.todo.rcpt_to.length != 0) {
				   var a = hmail.todo.rcpt_to[0];
				   var rcpt = new Address (a.original);
				   send_client.send_command('RCPT',
							    'TO:' + rcpt);
			       }
			       else 
				   send_client.send_command('RCPT',
							    'TO: ' + '<>');
			   };

			   var send_data = function() {
			       send_client.send_command('DATA');
			   }
			   
			   send_client.on('mail', send_rcpt);
			   send_client.on('rcpt', send_data);
			   
			   send_client.on('data', function () {
			       send_client.start_data(hmail.data_stream());
			   });				   
		       });    
}

// Finally we come to the error processing part
HMailItem.prototype.process_bad_code = function(code, msg) {
    var self = this;
    self.clear_timers();

    // if this email is delivered successfully; not neccessary
    // to goto next steps
    if (self.sent) return;

    // in case the server side respond two error messages to
    // a single command
    if (!self.erred)  {
	self.erred = true;
	self.bounce(msg);	
    }
}

HMailItem.prototype.bounce = function (err) {
    this.loginfo("bouncing mail: " + err);
    if (!this.todo) {
        // haven't finished reading the todo, delay here...
        var self = this;
        self.on('ready', function () { self._bounce(err) });
        return;
    }
    
    this._bounce(err);
}

HMailItem.prototype._bounce = function (err) {
    plugins.run_hooks("bounce", this, err);
}

HMailItem.prototype.bounce_respond = function (retval, msg) {
    
    var hmail = this;
    var ts = new Date().getTime();
    var email_id = hmail.todo['email_id'];
    var receiver = hmail.todo['receiver'];
    var user_id = hmail.todo['user_id']; 
    var category_id = hmail.todo['category'];
    var message = msg;

    var status = 0;
    switch(retval) {
    case constants.spam:
        status = 2;
        break;
    case constants.invalid:
        status = 4;
        break;
    default:
        status = -1;
        break;
    }

    var values = '&OUT,' + ts + ',' + status  + ',' + email_id + ',' + user_id + ',' + category_id + ',' + message + '#';
    var log_data = '&USER_OUT,' + user_id + '#';
    if (status > 0) {
        control.syslog.log(control.syslog.LOG_INFO, values);
        control.syslog.log(control.syslog.LOG_INFO, log_data);
    }
    
    var self = this;
    if (retval != constants.cont) {
        if (retval === constants.invalid || retval === constants.spam ||
	    retval === constants.bounce) {
	    fs.unlink(this.path, function(err) {
		delete control.tracked_deliveries[self.filename];
		control.getPolicy(self.todo.domain).dispose();
		self.send_next(self.todo.domain);
	    });
        }
	else {
	    if (retval === constants.not_send) {
		self.not_send(constants.error);
		return;
	    }
	    this.temp_fail("things other than invalid user name");
	    if (retval === constants.delay) {
		control.getPolicy(this.todo.domain).freeze();
	    }
	    return;
	}
    }
}

/**
 * call this when errors such as invalid receiver
 */
HMailItem.prototype.fatal_fail = function (err) {

    var hmail = this;
    var ts = new Date().getTime();
    var status = 4;
    var email_id = hmail.todo['email_id'];
    var receiver = hmail.todo['receiver'];
    var user_id =  hmail.todo['user_id']; 
    var category_id = hmail.todo['category'];
    var message = err;
    var values = '&ERROR,' + ts + ',' + status  + ',' + email_id + ',' + user_id + ',' + category_id + ',' + message + '#';
    var log_data = '&USER_OUT,' + user_id + '#';
    control.syslog.log(control.syslog.LOG_INFO, values);
    control.syslog.log(control.syslog.LOG_INFO, log_data);

    this.logerror("Fatal Error: " + err);
    
    fs.unlink(this.path, function(err) {
	control.getPolicy(hmail.todo.domain).dispose();
    	delete control.tracked_deliveries[hmail.filename];
    });
}

HMailItem.prototype.requeue_error = function(temp_path, err) {
    var temp_path = temp_path.toString();
    var file = temp_path.substring(temp_path.lastIndexOf('/')+1, temp_path.length);
    if (/^\./.test(file)) {
        // dot-file...
	var self = this;
        if (path.existsSync(temp_path)) {
            unlink(temp_path, function(err) {	    
	        self.loginfo('Due to:' + err + ','
			     + 'delete temp file:' 
			     + temp_path + '!!!');
	    });
        }
    }
}

HMailItem.prototype.not_send = function(status) {    
    var self = this;
    control.getPolicy(self.todo.domain).dispose();
    self.loginfo(self.filename + ': not send....'  + status);    
    if (status === constants.no)
        processing_queue.push(self.todo.domain, self.filename);
    else if (status === constants.error) 
        self.temp_fail('connection closed before sent out all data');    
}

HMailItem.prototype.delivered = function () {
    this.loginfo("Successfully delivered mail: " + this.filename);
    plugins.run_hooks("delivered", this, [this.filename]);
}

HMailItem.prototype.temp_fail = function (err) {
    this.num_failures++;
    this.clear_timers();

    if (this.num_failures === config.get('outbound.failuresForRouting') || 6) {
	// use another ip to deliver this email
    }

    // Test for max failures which is configurable.
    if (this.num_failures >= (config.get('outbound.maxTempFailures') || 6)) {
	return this.fatal_fail("Too many failures (" + err + ")");
    }
    
    // basic strategy is we exponentially grow the delay to the power
    // two each time, starting at 2 ** 6 seconds
    
    // Note: More advanced options should be explored in the future as the
    // last delay is 2**17 secs (1.5 days), which is a bit long... Exim has a max delay of
    // 6 hours (configurable) and the expire time is also configurable... But
    // this is good enough for now.     
    var delay = (Math.pow(2, (this.num_failures + 5)) * 1000);
    var until = new Date().getTime() + delay;
    
    this.loginfo("Temp failing " + this.filename + " for " + (delay/1000) + " seconds: " + err);
    var new_filename = this.filename.replace(/^(\d+)_(\d+)_/, until + '_' + this.num_failures + '_');
    
    var hmail = this;
    var new_path = path.join(queue_dir, new_filename);
    fs.rename(this.path, new_path, function (err) {
        if (err) {
	    hmail.requeue_error(hmail.path, err);
        }
	
        delete control.tracked_deliveries[hmail.filename];
	hmail.filename = new_filename;
	hmail.path = new_path;
	control.tracked_deliveries[new_filename] = true;
	
	hmail.erred = null;
	setTimeout(function(){ hmail.send()}, delay);
    });
}

// The following handler has an impact on outgoing mail. It does remove the queue file.
HMailItem.prototype.delivered_respond = function (retval, msg) {
    
    if (retval != constants.cont && retval != constants.ok) {
        this.logwarn("delivered plugin responded with: " + retval + " msg=" + msg + ".");
    }

    // Remove the file.
    var self  = this;
    self.sent = true;
    self.clear_timers();
    fs.unlink(self.path, function(err) {
	if (err) {
	    logger.logerror(err + 'deliver unlink error');	    
	}
	control.getPolicy(self.todo.domain).dispose();
        self.loginfo('deleting ' + self.filename);
	delete control.tracked_deliveries[self.filename];
        self.send_next(self.todo.domain);
    });
}


HMailItem.prototype.clear_timers = function()
{
    if(!this.timeouts) return;	
    var size = this.timeouts.length;
    for (var i = 0; i < this.timeouts.length; ++i)
        clearTimeout(this.timeouts[i]);
}


HMailItem.prototype.send_next = function(domain) {
    var file_name = processing_queue.dequeue(domain);
    if (file_name)
    {
        var mail_item = new HMailItem(file_name, path.join(queue_dir, file_name));
        control.getPolicy(domain).prepose();
        setTimeout(function(){mail_item.send()}, 0);        
    }
}
