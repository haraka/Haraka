
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

function dot_files (element) {
    return element.match(/^\./) == null;
}

exports.sandbox_require = function (id) {
    if (id[0] == '.' && id[1] != '.') {
        try {
            var override = path.join(__dirname, id + '.js');
            fs.statSync(override);
            id = override;
        }
        catch (e) {
            try {
                override = path.join(__dirname, '..', '..', 'outbound', id.replace(/^[./]*/, '') + '.js');
                fs.statSync(override);
                id = override;
            }
            catch (err) {
                id = '../../' + id.replace(/^[./]*/, '');
            }
        }
    }
    else if (id[0] == '.' && id[1] == '.') {
        id = '../../' + id.replace(/^[./]*/, '');
    }
    return require(id);
}

function make_test (module_path, test_path, additional_sandbox) {
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
        Object.keys(additional_sandbox).forEach(function (k) {
            sandbox[k] = additional_sandbox[k];
        });
        vm.runInNewContext(code, sandbox);
    };
}

exports.add_tests = function (module_path, tests_path, test_exports, add_to_sandbox) {
    var additional_sandbox = add_to_sandbox || {};
    var tests = fs.readdirSync(tests_path).filter(dot_files);
    for (var x = 0; x < tests.length; x++) {
        test_exports[tests[x]] = make_test(module_path, tests_path + tests[x], additional_sandbox);
    }
};
