"use strict";

exports.register = function () {
    var plugin = this;
    plugin.inherits('base_plugin');
}

exports.main_plugin_method = function () {
    return "main";
}
