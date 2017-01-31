'use strict';

var fs   = require('fs');
var path = require('path');

var lines = [
    'From: John Johnson <john@example.com>',
    'To: Jane Johnson <jane@example.com>',
    "Subject: What's for dinner?",
    '',
    "I'm hungry.",
    '',
];

exports.outbound = {
    'converts \\n and \\r\\n line endings to \\r\\n' : function (test) {
        test.expect(2);

        ['\n', '\r\n'].forEach(function (ending) {
            var contents = lines.join(ending);
            var result = '';

            // Set data_lines to lines in contents
            var match;
            var re = /^([^\n]*\n?)/;
            while (match = re.exec(contents)) {
                var line = match[1];
                line = line.replace(/\r?\n?$/, '\r\n'); // assure \r\n ending
                // transaction.add_data(new Buffer(line));
                result += line;
                contents = contents.substr(match[1].length);
                if (contents.length === 0) {
                    break;
                }
            }

            test.deepEqual(lines.join('\r\n'), result);
        });
        test.done();
    }
};

exports.get_tls_options = {
    setUp : function (done) {
        process.env.HARAKA_TEST_DIR=path.resolve('tests');
        this.outbound = require('../outbound');
        done();
    },
    tearDown: function (done) {
        process.env.HARAKA_TEST_DIR='';
        done();
    },
    'gets TLS properties from tls.ini.main': function (test) {
        test.expect(1);
        var tls_config = this.outbound.get_tls_options(
            { exchange: 'mail.example.com'}
        );
        test.deepEqual(tls_config, {
            servername: 'mail.example.com',
            requestCert: true,
            honorCipherOrder: false,
            rejectUnauthorized: false
        });
        test.done();
    },
    'gets TLS properties from tls.ini.outbound': function (test) {
        test.expect(1);

        // reset config to load from tests directory
        this.outbound.net_utils.config = this.outbound.net_utils.config.module_config(path.resolve('tests'));
        this.outbound.config = this.outbound.config.module_config(path.resolve('tests'));

        var tls_config = this.outbound.get_tls_options(
            { exchange: 'mail.example.com'}
        );

        test.deepEqual(tls_config, {
            servername: 'mail.example.com',
            key: fs.readFileSync(path.resolve('tests','config','tls_key.pem')),
            cert: fs.readFileSync(path.resolve('tests','config','tls_cert.pem')),
            dhparam: fs.readFileSync(path.resolve('tests','config','dhparams.pem')),
            ciphers: 'ECDHE-RSA-AES256-GCM-SHA384',
            rejectUnauthorized: false,
            requestCert: false,
            honorCipherOrder: false
        });
        test.done();
    },
}
