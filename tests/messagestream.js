
const stream = require('stream')

const MessageStream = require('../messagestream')

function _set_up (done) {
    this.ms = new MessageStream({ main: { } }, 'msg', []);
    done();
}

function _tear_down (done) {
    done();
}

exports.messagestream = {
    setUp : _set_up,
    tearDown : _tear_down,
    'is a Stream' (test) {
        test.expect(2);
        test.ok(this.ms instanceof MessageStream);
        test.ok(this.ms instanceof stream.Stream);
        test.done();
    },
    'gets message data' (test) {
        this.ms.add_line('Header: test\r\n');
        this.ms.add_line('\r\n');
        this.ms.add_line('I am body text\r\n');
        this.ms.add_line_end();
        this.ms.get_data((data) => {
            test.ok(/^[A-Za-z]+: /.test(data.toString()))
            test.done();
        })
    },
}
