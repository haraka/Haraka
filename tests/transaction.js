const Transaction  = require('../transaction');

function _set_up (done) {
    this.transaction = Transaction.createTransaction();
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

    'correct output encoding when content in non-utf8 #2184': function (test) {
        const self = this;

        // Czech panagram "Příliš žluťoučký kůň úpěl ďábelské ódy.\n" in ISO-8859-2 encoding
        const message = new Buffer([0x50, 0xF8, 0xED, 0x6C, 0x69, 0xB9, 0x20, 0xBE, 0x6C, 0x75, 0xBB, 0x6F, 0x76, 0xE8, 0x6B, 0xFD, 0x20, 0x6B, 0xF9, 0xF2, 0xFA, 0xEC, 0x6C, 0x20, 0xEF, 0xE2, 0x62, 0x65, 0x6C, 0x73, 0x6b, 0xE9, 0x20, 0xF3, 0x64, 0x79, 0x2E, 0x0A]);
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
                test.ok(body.toString('binary').indexOf(message.toString('binary')) !== -1, "message not damaged");
                test.done();
            });
        });
    }
};
