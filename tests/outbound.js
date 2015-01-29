'use strict';

var lines = [
    'From: John Johnson <john@example.com>',
    'To: Jane Johnson <jane@example.com>',
    "Subject: What's for dinner?",
    '',
    "I'm hungry.",
    '',
];

exports.outbound = {
    // setUp : _set_up,
    // tearDown : _tear_down,
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

