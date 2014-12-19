'use strict';

var fs         = require('fs');
var path       = require('path');
var vm         = require('vm');

var stub       = require('./stub');
var vm_harness = require('./vm_harness');
var constants  = require('../../constants');
var logger     = require('../../logger');

function Plugin(name) {
    if (false === (this instanceof Plugin)) {
        return new Plugin(name);
    }

    this.name = name;
    this.base = {};
    this.register_hook = stub();
    this.config = stub();
    constants.import(global);

    logger.add_log_methods(this, 'test');

    return this.load_plugin(name);
}

Plugin.prototype.load_plugin = function(name) {
    var rf;
    var full_path = __dirname + "/../../plugins/" + name + ".js";

    try {
        rf = fs.readFileSync(full_path);
    }
    catch (err) {
        throw "Loading test plugin " + name + " failed: " + err;
    }
    var code = '"use strict";' + rf;

    var sandbox = {
        require: vm_harness.sandbox_require,
        __filename: full_path,
        __dirname:  path.dirname(full_path),
        exports: this,
        console: console,
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
        setInterval: setInterval,
        clearInterval: clearInterval,
        process: process,
        Buffer: Buffer,
        Math: Math,
    };
    constants.import(sandbox);
    try {
        vm.runInNewContext(code, sandbox, name);
    }
    catch (err) {
        throw err;
    }

    return this;
};

Plugin.prototype.inherits = function (parent_name) {
    var parent_plugin = this.load_plugin(parent_name);
    for (var method in parent_plugin) {
        if (!this[method]) {
            this[method] = parent_plugin[method];
        }
    }
    this.base[parent_name] = parent_plugin;
};

module.exports = Plugin;
