
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

function dot_files (element) {
    return element.match(/^\./) == null;
}

exports.sandbox_require = id => {
    if (id[0] == '.' && id[1] != '.') {
        let override;
        try {
            override = path.join(__dirname, `${id}.js`);
            fs.statSync(override);
            id = override;
        }
        catch (e) {
            try {
                override = path.join(__dirname, '..', '..', 'outbound', `${id.replace(/^[./]*/, '')}.js`);
                fs.statSync(override);
                id = override;
            }
            catch (err) {
                id = `../../${  id.replace(/^[./]*/, '')}`;
            }
        }
    }
    else if (id[0] == '.' && id[1] == '.') {
        id = `../../${  id.replace(/^[./]*/, '')}`;
    }
    return require(id);
}

function make_test (module_path, test_path, additional_sandbox) {
    return test => {
        let code = fs.readFileSync(module_path);
        code += fs.readFileSync(test_path);
        const sandbox = {
            require: exports.sandbox_require,
            console,
            Buffer,
            exports: {},
            test
        };
        for (const k of Object.keys(additional_sandbox)) {
            sandbox[k] = additional_sandbox[k];
        }
        vm.runInNewContext(code, sandbox);
    };
}

exports.add_tests = (module_path, tests_path, test_exports, add_to_sandbox) => {
    const additional_sandbox = add_to_sandbox || {};
    const tests = fs.readdirSync(tests_path).filter(dot_files);
    for (const test of tests) {
        test_exports[test] = make_test(module_path, tests_path + test, additional_sandbox);
    }
}
