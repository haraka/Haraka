'use strict';

require('../configfile').watch_files = false;
var vm_harness     = require('./fixtures/vm_harness');
var fs             = require('fs');
var vm             = require('vm');
var config         = require('../config');
var path           = require('path');
var util_hmailitem = require('./fixtures/util_hmailitem');

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

var removeTestQueueDir = function (done) {
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
                fs.unlinkSync(curPath);
            });
            done();
        }
        else {
            done();
        }
    });
};

exports.outbound_protocol_tests = {
    setUp : ensureTestQueueDirExists,
    tearDown : removeTestQueueDir,
};

vm_harness.add_tests(
    path.join(__dirname, '/../outbound.js'),
    path.join(__dirname, 'outbound_protocol/'),
    exports.outbound_protocol_tests,
    {
        test_queue_dir: queue_dir,
        process: process
    }
);
