"use strict";

var stub      = require('tests/fixtures/stub'),
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
    var last_err;
    var full_paths = [];

    require.paths.forEach(function (pp) {
        full_paths.push(path.resolve(pp, name) + '.js');
    });

    for (var i=0, j=full_paths.length; i<j; i++) {
        try {
            rf = fs.readFileSync(full_paths[i]);
            break;
        }
        catch (err) {
            last_err = err;
            continue;
        }
    }
    if (!rf) {
        throw "Loading test plugin " + name + " failed: " + last_err;
    }

    var code = '"use strict";' + rf;

    // hax for testing
    code = code.replace("./address", "../../address");

    var sandbox = {
        require: require,
        __filename: full_paths[i],
        __dirname:  path.dirname(full_paths[i]),
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
