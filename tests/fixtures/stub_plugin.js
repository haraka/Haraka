"use strict";

var stub      = require('../fixtures/stub'),
    path      = require('path'),
    constants = require('../../constants'),
    vm        = require('vm'),
    fs        = require('fs');

function Plugin(name) {
    if (false === (this instanceof Plugin)) {
        return new Plugin(name);
    }

    this.inherits = stub();
    this.register_hook = stub();
    this.config = stub();

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

    var sandbox_require = function (id) {
        if (id[0] == '.') {
            try {
                fs.statSync(__dirname + '/' + id + '.js');
            } catch (e) {
                id = '../../' + id;
            }
        }
        return require(id);
    }

    var sandbox = {
        require: sandbox_require,
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
