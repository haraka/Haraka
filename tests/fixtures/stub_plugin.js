"use strict";

var stub       = require('./stub'),
    vm_harness = require('./vm_harness'),
    path       = require('path'),
    constants  = require('../../constants'),
    vm         = require('vm'),
    fs         = require('fs');

function Plugin(name) {
    if (false === (this instanceof Plugin)) {
        return new Plugin(name);
    }

    this.name = name;
    this.inherits = stub();
    this.register_hook = stub();
    this.config = stub();

    var levels = [ 'data', 'protocol', 'debug', 'info', 'notice', 'warn', 'error', 'crit', 'alert', 'emerg' ];
    for (var i=0; i < levels.length; i++) {
        this['log' + levels[i]] = stub();
    }

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

module.exports = Plugin;
