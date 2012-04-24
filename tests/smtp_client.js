require('../configfile').watch_files = false;
var vm_harness = require('./fixtures/vm_harness');

vm_harness.add_tests(__dirname + '/../smtp_client.js',
    __dirname + '/smtp_client/', exports);
