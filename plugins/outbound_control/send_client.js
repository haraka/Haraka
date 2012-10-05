// SMTP client object and class. This allows for every part of the client
// protocol to be hooked for different levels of control, such as
// smtp_forward and smtp_proxy queue plugins.
var util         = require('util');
var events       = require('events');
var generic_pool = require('generic-pool');
var policy      = require('./rate_policy');
var config       = require('../../config');
var logger       = require('../../logger');
var constants    = require('../../constants');
var uuid         = require('../../utils').uuid;
var line_socket  = require('../../line_socket');
var Address      = require('../../address').Address;

var smtp_regexp  = /^([0-9]{3})([ -])(.*)/;

var STATE_IDLE      = 1;
var STATE_ACTIVE    = 2;
var STATE_RELEASED  = 3;
var STATE_DEAD      = 4;
var STATE_DESTROYED = 5;

function SendClient(port, host, timeout, enable_tls) {
    events.EventEmitter.call(this);
    this.uuid = uuid();
    this.socket = line_socket.connect(port, host, null, null);
    this.socket.setTimeout(30000);
    this.state = STATE_IDLE;
    this.command = 'greeting';
    this.response = [];
    this.connected = false;
    this.sent = 0;
    var self = this;
        
    this.socket.on('line', function (line) {
        self.emit('server_protocol', line);
        var matches = smtp_regexp.exec(line);
        if (!matches) {
            self.emit('error', self.uuid + ': Unrecognised response from upstream server: ' + line);
            // self.destroy(); error is handled by the error event handler
            // e.g; renren mail server returns error code like 5.1.2 or something like that
            return;
        }

        var code = matches[1],
        cont = matches[2],
        msg = matches[3];
        self.response.push(msg);
        if (cont !== ' ') {
            return;
        }

        if (self.command === 'ehlo') {
            if (code.match(/^5/)) {
                // Handle fallback to HELO if EHLO is rejected
                self.emit('greeting', 'HELO');
                return;
            }
            self.emit('capabilities');
            if (self.command != 'ehlo') {
                return;
            }
        }

        if (self.command === 'xclient' && code.match(/^5/)) {
            // XCLIENT command was rejected (no permission?)
            // Carry on without XCLIENT
            self.command = 'helo';
        }
        else if (code.match(/^[45]/)) {	    
            self.emit('bad_code', code, msg);	    
            if (self.state != STATE_ACTIVE) {
                return;
            }
        }
        
        if (self.command == 'dot' && code.match(/250/)) {
            self.emit('delivered');        
        }
        
        switch (self.command) {
        case 'xclient':
            self.xclient = true;
            self.emit('xclient', 'EHLO');
            break;
        case 'starttls':
            this.upgrade({key: key, cert: cert});
            break;
        case 'greeting':
            self.connected = true;
            self.emit('greeting', 'EHLO');
            break;
        case 'ehlo':
            self.emit('helo');
            break;
        case 'helo':
        case 'mail':
        case 'rcpt':
        case 'data':
        case 'dot' : // we don't do anything for dot
        case 'rset':
            self.emit(self.command);
            break;
        case 'quit':
            self.emit('quit');
            break;
        default:
            throw new Error("Unknown command: " + self.command);
        }
    });

    this.socket.on('drain', function () {
        if (self.command === 'mailbody') {
            process.nextTick(function () { self.continue_data() });
        }
    });  
}

util.inherits(SendClient, events.EventEmitter);

SendClient.prototype.send_command = function (command, data) {
    var line = (command == 'dot') ? '.' : command + (data ? (' ' + data) : '');
    
    this.emit('client_protocol', line);
    this.command = command.toLowerCase();
    this.response = [];
    this.socket.write(line + "\r\n");
};

SendClient.prototype.start_data = function (data) {
    this.command = 'mailbody';
    if (data instanceof Function) {
        this.send_data = data;
    }
    else if (data instanceof Array) {
        var data_marker = 0;
        this.send_data = function () {
            while (data_marker < data.length) {
                var line = data[data_marker];
                data_marker++;
                if (!this.send_data_line(line)) {
                    return false;
                }
            }
            return true;
        };
    }
    else {
	var self = this;
        this.send_data = function () {
	    
	    data.removeAllListeners('data');
	    data.removeAllListeners('end');
	    data.removeAllListeners('error');
	    
	    // this.socket

	    data.pipe(this.socket, {end: false});
	    
            data.on('error', function (err) {
		self.destroy();
            });
	    
            data.on('data', function (data) {
		
	    });
	    
            data.on('end', function () {
		// in case somehow 'end' got emitted twice
		if (self.command === 'dot')
		    return;
		self.send_command('dot');
		return false;
            });
        };
    }
    this.continue_data();
};

SendClient.prototype.continue_data = function () {    
    if (!this.send_data()) {
        return;
    }
};

SendClient.prototype.send_data_line = function (line) {
    return this.socket.write(line);
};

SendClient.prototype.release = function () {
    if (!this.connected || this.command == 'data' || this.command == 'mailbody') {
        // Destroy here, we can't reuse a connection that was mid-data.
        this.destroy();
        return;
    }

    if (this.sent === policy.get_ISPConfig(this.dom, 'sessions')) {
	this.destroy();
	return;
    }

    logger.logdebug('[send_client_pool] ' + this.uuid + ' resetting, state=' + this.state);
    if (this.state == STATE_DESTROYED) {
        return;
    }
    
    this.state = STATE_RELEASED;
    this.removeAllListeners('greeting');
    this.removeAllListeners('capabilities');
    this.removeAllListeners('xclient');
    this.removeAllListeners('helo');
    this.removeAllListeners('mail');
    this.removeAllListeners('rcpt');
    this.removeAllListeners('data');
    this.removeAllListeners('dot');
    this.removeAllListeners('rset');
    this.removeAllListeners('client_protocol');
    this.removeAllListeners('server_protocol');
    this.removeAllListeners('error');
    this.removeAllListeners('delivered');

    this.on('rset', function () {
        logger.logdebug('[send_client_pool] ' + this.uuid + ' releasing, state=' + this.state);
        if (this.state == STATE_DESTROYED) {
            return;
        }
        this.state = STATE_IDLE;
        this.removeAllListeners('rset');
        this.removeAllListeners('bad_code');
        this.pool.release(this);
    });

    this.send_command('RSET');
};

SendClient.prototype.destroy = function () {
    if (this.state != STATE_DESTROYED) {
        this.pool.destroy(this);
    }
};

// Separate pools are kept for each set of server attributes.
exports.get_pool = function (conn_pool, dom,  port, host, timeout, enable_tls, max) {
    var port = port || 25;
    var host = host || 'localhost';
    var timeout = (timeout == undefined) ? 300 : timeout;
    var enable_tls = /(true|yes|1)/i.exec(enable_tls) != null;
    
    // connections are pooled by dom
    var name = dom;
    
    if (!conn_pool) {
        conn_pool = {};
    }    
    
    if (!conn_pool[name]) {
        var pool = generic_pool.Pool({
            name: name,
            create: function (callback) {
                var send_client = new SendClient(port, host, timeout, enable_tls);
                logger.logdebug('[send_client_pool] ' + send_client.uuid + ' created');
                callback(null, send_client);
            },
            destroy: function(send_client) {
                logger.logdebug('[send_client_pool] ' + send_client.uuid
                                + ' destroyed, state=' + send_client.state);
                send_client.state = STATE_DESTROYED;
                send_client.socket.destroy();
            },
            max: max || 1000,
            idleTimeoutMillis: 300000,
            log: function (str, level) {
                level = (level == 'verbose') ? 'debug' : level;
                logger['log' + level]('[send_client_pool] ' + str);
            }
        });

        var acquire = pool.acquire;
        pool.acquire = function (callback, priority) {
            var callback_wrapper = function (err, send_client) {
                send_client.pool = pool;
		send_client.dom = dom;
                if (send_client.state == STATE_DEAD) {
                    send_client.destroy();	    
                    pool.acquire(callback, priority);
                    return;
                }
                send_client.state = STATE_ACTIVE;
                send_client.data_sent = constants.no;
                send_client.bad_code = constants.no;
		send_client.error = constants.no;
                callback(err, send_client);
            };
            acquire.call(pool, callback_wrapper, priority);
        };
        conn_pool[name] = pool;
    }
    return conn_pool[name];
};

exports.run_send = function(conn_pool, dom, port, host, timeout, enable_tls,
                            max, hmail, callback) {
    var pool = exports.get_pool(conn_pool, dom, port, host, timeout,
                                enable_tls, max);
    // no connection is available for this domain, push it back to queue
    if (pool.getPoolSize() === max  && pool.availableObjectsCount() === 0) 
    {
	hmail.try_again(constants.no);
	return;
    }

    // acquire a connection
    pool.acquire(function (err, send_client) {
	// log client side data flow
	send_client.on('client_protocol', function (line) {
	    hmail.logprotocol(send_client.uuid + ' C: ' + line);
	});
	
	// log server side data flow
	send_client.on('server_protocol', function (line) {
	    hmail.logprotocol(send_client.uuid + ' S:' + line);
	});
        
	var closed = function (msg) {
            return function (error) {
		if (!error) {
                    error = '';
		}
		if (send_client.state === STATE_ACTIVE) {
                    // if an email is delivered; or the process_bad_code
                    // procedure got called, we don't go to next steps
	            if (hmail.sent || hmail.erred) return;
                    
                    // closed is invoked from the STATE_ACTIVE state, there
                    // must be an error 
		    send_client.error = constants.error    
		    hmail.try_again(send_client.bad_code | send_client.data_sent
                                   | send_client.error);
                    
                    // destroy this client after error processing;  then
                    // status becomes destroyed, nothing will happen
                    send_client.destroy();                    
		}
		else {
                    // state is initialized to STATE_IDLE or reset to STATE_IDLE
                    // after rset command; in this case, either the email is
                    // delivered; or nothing happens so far. In the former case,
                    // we did nothing in try_again(); in the latter case, call
                    // temp_fail in try_again; destroy the client
                    if (send_client.state === STATE_IDLE) {
			send_client.state = STATE_DEAD;                        
			hmail.try_again(send_client.bad_code |
                                       send_client.data_sent |
                                       send_client.error);	 
 			send_client.destroy();
                    }
                    
                    // When the email is delivered or an error occurs, the state
                    // of send_client becomes STATE_RELEASED; in the former
                    // case, we did nothing; in the latter case, the
                    // process_bad_code error got called already, nothing needs
                    // to be done; just destroy thie client
                    else if (send_client.state === STATE_RELEASED) {
	                send_client.destroy();
		        hmail.try_again(send_client.bad_code |
                                       send_client.data_sent |
                                       send_client.error);
                    }
		}
            };
	};
	
	// transmission error occured
	// if (!send_client.socket['_events']['error'])
	send_client.socket.removeAllListeners('error');
	send_client.socket.removeAllListeners('timeout');
	send_client.socket.removeAllListeners('end');
	send_client.socket.removeAllListeners('close');	
	
	send_client.socket.on('error', closed('error!!!'));
	
	// timeout due to inactivity
	// if (!send_client.socket['_events']['timeout'])
	send_client.socket.on('timeout', closed('timeout!!!'));
	
	// an transmission error occured, and the socket is fully closed
	// if (!send_client.socket['_events']['close'])
	send_client.socket.on('close', closed('closed!!!!!'));
	
	// the other side close the socket
	// if (!send_client.socket['_events']['end'])
	send_client.socket.on('end', closed('end!!!!!!!'));

	// process helo
        var helo = function (command) {
            if (send_client.xclient)
                send_client.send_command(command, connection.hello_host);
            else
                send_client.send_command(command, config.get('me'));
        };
	
	send_client.on('greeting', helo);
	send_client.on('xclient', helo);
	
	// not sure what this's for ? keep it here now
	send_client.on('capabilities', function () {
            for (var line in send_client.response) {
                if (send_client.response[line].match(/^XCLIENT/)) {
                    if(!send_client.xclient) {
                        send_client.send_command('XCLIENT',
						 'ADDR=' + connection.remote_ip);
                        return;
                    }
                }
                if (send_client.response[line].match(/^STARTTLS/)) {
                    var key = config.get('tls_key.pem', 'data').join("\n");
                    var cert = config.get('tls_cert.pem', 'data').join("\n");
                    if (key && cert && enable_tls) {
                        send_client.socket.on('secure', function () {
                            send_client.emit('greeting', 'EHLO');
                        });
                        send_client.send_command('STARTTLS');
                        return;
                    }
		}
	    }
        });
	
	send_client.on('helo', function () {
	    var mail_from  = new Address (hmail.todo.mail_from.original);
	    send_client.send_command('MAIL',
	  	   	             'FROM:' + mail_from);
        });
        
        send_client.on('delivered', function () {
	    send_client.sent++;
	    send_client.data_sent = constants.data_sent;
	    hmail.delivered();
            send_client.release();
        });
	
        send_client.on('error', function (msg) {
            send_client.error = constants.error;
            hmail.try_again(constants.error);
            send_client.destroy();
        });

	send_client.on('bad_code', function (code, msg) {
	    hmail.process_bad_code(code, msg);
            send_client.bad_code = constants.bad_code;
	    send_client.release();
	});
	
        if (send_client.connected) {
            if (send_client.xclient) {
                send_client.send_command('XCLIENT',
					 'ADDR=' + connection.remote_ip);
            }
            else {
                send_client.emit('helo');
            }
        }
        
        // hmail.timeouts = hmail.timeouts || [];
        // hmail.timeouts.push(setTimeout(function(){
	//     hmail.loginfo(send_client);
        //     // send_client.socket.emit('timeout');
        // }, 150 * 1000));

        callback(err, send_client);
    });
}
