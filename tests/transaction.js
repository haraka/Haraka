var Transaction  = require('../transaction');

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
        var self = this;

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
        var self = this;

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
                test.ok(/banner$/.test(body.trim()), "banner applied");
                test.done();
            });
        });
    },
};
