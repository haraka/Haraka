"use strict";

var stub = require('tests/fixtures/stub');

var plugin = exports;

function Plugin(name) {
}

plugin.createPlugin = function(name) {
    var obj  = new Plugin(name);
    var plug = require(name);

    for (var k in plug) {
        if (plug.hasOwnProperty(k)) {
            obj[k] = plug[k];
        }
    }

    return obj;
};
