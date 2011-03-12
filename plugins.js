// load all defined plugins

var logger      = require('./logger');
var config      = require('./config');
var constants   = require('./constants');
var path        = require('path');

var plugin_path = process.env.HARAKA ? path.join(process.env.HARAKA, 'plugins') : './plugins';
var hooks = [
    'connect',
    'pre-connection',
    'connect',
    'ehlo_parse',
    'ehlo',
    'helo_parse',
    'helo',
    'auth_parse',
    'auth',
    'auth-plain',
    'auth-login',
    'auth-cram-md5',
    'rcpt_parse',
    'rcpt_pre',
    'rcpt',
    'mail_parse',
    'mail',
    'mail_pre', 
    'data',
    'data_headers_end',
    'data_post',
    'queue_pre',
    'queue',
    'queue_post',
    'vrfy',
    'noop',
    'quit',
    'reset_transaction',
    'disconnect',
    'post-connection',
    'unrecognized_command',
    'deny',
    'ok',
    'received_line',
    'help'
];

function _load_plugin(self) {
    self.the_plugin = require(self.full_path);
    self.the_plugin.register.call(self);
}

function Plugin(name) {
    var full_path = path.resolve(plugin_path, name);
    
    this.full_path = full_path;
    this.name = name;
    
    this.hooks = {};
    
    _load_plugin(this);
}

Plugin.prototype.register_hook = function(hook_name, method_name) {
    this.hooks[hook_name] = this.hooks[hook_name] || [];
    this.hooks[hook_name].push(method_name);
    
    logger.log("registered hook " + hook_name + " to " + this.name + "." + method_name);
}

var plugins = exports;

plugins.load_plugins = function () {
    logger.log("Loading plugins");
    var plugin_list = config.get('plugins');
    
    plugins.plugin_list = plugin_list.map(plugins.load_plugin);
};

plugins.load_plugin = function(plugin) {
    logger.log("Loading plugin: " + plugin);
    
    // load the plugin here
    return new Plugin(plugin);
}

plugins.load_plugins();

plugins.run_hooks = function (hook, connection, params) {
    if (!params) params = [];
    
    logger.log("running " + hook + " hooks");
    
    connection.hooks_to_run = [];
    
    for (i = 0; i < plugins.plugin_list.length; i++) {
        var plugin = plugins.plugin_list[i];
        
        if (plugin.hooks[hook]) {
            var j;
            plugin.connection = connection;
            for (j = 0; j < plugin.hooks[hook].length; j++) {
                var hook_code_name = plugin.hooks[hook][j];
                logger.log("adding " + hook_code_name + " to run list");
                connection.hooks_to_run.push([plugin, hook_code_name]);
            }
        }
    }
    
    plugins.run_next_hook(hook, connection, params);
};

plugins.run_next_hook = function(hook, connection, params) {
    var called_once = 0;
    var callback = function(retval, msg) {
        if (called_once) {
            logger.log("callback called multiple times. Ignoring subsequent calls");
            return;
        }
        called_once++;
        if (!retval) retval = constants.cont;
        if (connection.hooks_to_run.length == 0 || 
            retval !== constants.cont)
        {
            var respond_method = hook + "_respond";
            connection[respond_method](retval, msg);
        }
        else {
            plugins.run_next_hook(hook, connection, params);
        }
    }
    
    if (!connection.hooks_to_run.length) return callback();
    
    // shift the next one off the stack and run it.
    var item = connection.hooks_to_run.shift();
    item[0].the_plugin[ item[1] ].call(item[0], callback, params);
};

