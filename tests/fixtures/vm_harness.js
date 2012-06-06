var fs = require('fs');
var vm = require('vm');

function dot_files(element) {
    return element.match(/^\./) == null;
}

exports.sandbox_require = function (id) {
    if (id[0] == '.') {
        try {
            var override = __dirname + '/' + id + '.js';
            fs.statSync(override);
            id = override;
        } catch (e) {
            id = '../../' + id;
        }
    }
    return require(id);
}

function make_test(module_path, test_path) {
    return function (test) {
        var code = fs.readFileSync(module_path);
        code += fs.readFileSync(test_path);
        var sandbox = {
            require: exports.sandbox_require,
            console: console,
            Buffer: Buffer,
            exports: {},
            test: test
        };
        vm.runInNewContext(code, sandbox);
    };
}

exports.add_tests = function (module_path, tests_path, test_exports) {
    var tests = fs.readdirSync(tests_path).filter(dot_files);
    for (var x = 0; x < tests.length; x++) {
        test_exports[tests[x]] = make_test(module_path, tests_path + tests[x]);
    }
};
