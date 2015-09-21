'use strict';

require('../configfile').watch_files = false;
var vm_harness = require('./fixtures/vm_harness');
var fs = require('fs');
var vm = require('vm');

var config      = require('../config');
var path        = require('path');
var queue_dir = path.resolve(__dirname + '/test-queue/');

var ensureTestQueueDirExists = function(done) {
    fs.exists(queue_dir, function (exists) {
        if (exists) {
            done();
        }
        else {
            fs.mkdir(queue_dir, function (err) {
                if (err) {
                    return done(err);
                }
                done();
            });
        }
    });
};

var removeTestQueueDir = function(done) {
    fs.exists(queue_dir, function (exists) {
        if (exists) {
            var files = fs.readdirSync(queue_dir);
            files.forEach(function(file,index){
                var curPath = queue_dir + "/" + file;
                if (fs.lstatSync(curPath).isDirectory()) { // recurse
                    return done(new Error('did not expect an sub folder here ("' + curPath + '")! cancel'));
                }
            });
            files.forEach(function(file,index){
                var curPath = queue_dir + "/" + file;
                // console.log('unlinking ' + curPath);
                fs.unlinkSync(curPath);
            });
            done();
        }
        else {
            done();
        }
    });
};

exports.run_output_smtpcode_tests = {
    setUp : ensureTestQueueDirExists,
    tearDown : removeTestQueueDir,
    'run basic outbound test in vm': function (test) {
        var code = fs.readFileSync(__dirname + '/../outbound.js');
        code += fs.readFileSync(__dirname + '/outbound_protocol/basic_outbound_trial_test.js');
        var sandbox = {
            require: vm_harness.sandbox_require,
            console: console,
            Buffer: Buffer,
            exports: {},
            process: process,
            test: test,
            setTimeout: setTimeout,
            test_queue_dir: queue_dir, // will be injected into the test-module
        };
        vm.runInNewContext(code, sandbox);
    }
};

