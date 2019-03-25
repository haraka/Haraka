const fs = require('fs');
const path = require('path');

const transaction = require('../transaction');

function _set_up (done) {
    this.transaction = transaction.createTransaction();
    done();
}

function _tear_down (done) {
    done();
}

exports.transaction = {
    setUp : _set_up,
    tearDown : _tear_down,

    'add_body_filter': function (test) {
        const self = this;

        test.expect(3);

        this.transaction.add_body_filter('text/plain', function (ct, enc, buf) {
            // The actual functionality of these filter functions is tested in
            // mailbody.js.  This just makes sure the plumbing is in place.

            test.ok(ct.indexOf('text/plain') === 0, "correct body part");
            test.ok(/utf-?8/i.test(enc), "correct encoding");
            test.equal(buf.toString().trim(), "Text part", "correct body contents");
        });

        [
            "Content-Type: multipart/alternative; boundary=abcd\n",
            "\n",
            "--abcd\n",
            "Content-Type: text/plain\n",
            "\n",
            "Text part\n",
            "--abcd\n",
            "Content-Type: text/html\n",
            "\n",
            "<p>HTML part</p>\n",
            "--abcd--\n",
        ].forEach(function (line) {
            self.transaction.add_data(line);
        });
        this.transaction.end_data(function () {
            test.done();
        });
    },

    'regression: attachment_hooks before set_banner/add_body_filter': function (test) {
        const self = this;

        test.expect(2);

        this.transaction.attachment_hooks(function () {});
        this.transaction.set_banner('banner');
        this.transaction.add_body_filter('', function () {
            test.ok(true, "body filter called");
        });
        [
            "Content-Type: text/plain\n",
            "\n",
            "Some text\n",
        ].forEach(function (line) {
            self.transaction.add_data(line);
        });
        this.transaction.end_data(function () {
            self.transaction.message_stream.get_data(function (body) {
                test.ok(/banner$/.test(body.toString().trim()), "banner applied");
                test.done();
            });
        });
    },

    'correct output encoding when content in non-utf8 #2176': function (test) {
        const self = this;

        // Czech panagram "Příliš žluťoučký kůň úpěl ďábelské ódy.\n" in ISO-8859-2 encoding
        const message = Buffer.from([0x50, 0xF8, 0xED, 0x6C, 0x69, 0xB9, 0x20, 0xBE, 0x6C, 0x75, 0xBB, 0x6F, 0x76, 0xE8, 0x6B, 0xFD, 0x20, 0x6B, 0xF9, 0xF2, 0xFA, 0xEC, 0x6C, 0x20, 0xEF, 0xE2, 0x62, 0x65, 0x6C, 0x73, 0x6b, 0xE9, 0x20, 0xF3, 0x64, 0x79, 0x2E, 0x0A]);
        const payload = [
            "Content-Type: text/plain; charset=iso-8859-2; format=flowed\n",
            "\n",
            message
        ];

        test.expect(1);

        this.transaction.parse_body = true;
        this.transaction.attachment_hooks(function () {});

        payload.forEach(function (line) {
            self.transaction.add_data(line);
        });
        this.transaction.end_data(function () {
            self.transaction.message_stream.get_data(function (body) {
                test.ok(body.toString('binary').includes(message.toString('binary')), "message not damaged");
                test.done();
            });
        });
    }
}

function write_file_data_to_transaction (test_transaction, filename) {
    const specimen = fs.readFileSync(filename, 'utf8');
    const matcher = /[^\n]*([\n]|$)/g;

    let line;
    do {
        line = matcher.exec(specimen);
        if (line[0] == '') {
            break;
        }
        test_transaction.add_data(line[0]);
    } while (line[0] != '');

    test_transaction.end_data();
}

exports.base64_handling = {
    setUp : _set_up,
    tearDown: _tear_down,

    'varied-base64-fold-lengths-preserve-data': function (test) {
        const self = this;

        const parsed_attachments = {};
        self.transaction.parse_body = true;
        //accumulate attachment buffers.
        self.transaction.attachment_hooks(function (ct, filename, body, stream) {
            let attachment = Buffer.alloc(0);
            stream.on('data', function (data) {
                attachment = Buffer.concat([attachment, data]);
            });
            stream.on('end', function () {
                parsed_attachments[filename] = attachment;
            });
        });

        const specimen_path = path.join(__dirname, 'mail_specimen', 'varied-fold-lengths-preserve-data.txt');
        write_file_data_to_transaction(self.transaction, specimen_path);

        test.equal(self.transaction.body.children.length, 6);

        let first_attachment = null;
        for (const i in parsed_attachments) {
            const current_attachment = parsed_attachments[i];
            first_attachment = first_attachment || current_attachment;
            // All buffers from data that was encoded with varied line lengths should
            // still have the same final data.
            test.equal(true, first_attachment.equals(current_attachment),
                `The buffer data for '${i}' doesn't appear to be equal to the other attachments, and is likely corrupted.`);
        }
        test.done();
    },

    'base64-root-html-decodes-correct-number-of-bytes': function (test) {
        const self = this;

        self.transaction.parse_body = true;
        const specimen_path = path.join(__dirname, 'mail_specimen', 'base64-root-part.txt');
        write_file_data_to_transaction(self.transaction, specimen_path);

        test.equal(self.transaction.body.bodytext.length, 425);
        test.done();
    },
}
