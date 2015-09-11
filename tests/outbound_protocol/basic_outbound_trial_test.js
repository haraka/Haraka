
// This test file is executed by tests/outbound_protocol.js (see there)
//



test.expect(5);

// What is tested:
// A simple SMTP conversation is made
// At one point, the mocked remote SMTP says "5XX", and we test that the HMailItem.bounce function gets called


// this is file is - for running the test - appended to outbound.js.
// we copy over here "test_queue_dir" from vm-sandbox to the queue_dir back
// (queue_dir is outbound-private var introduced at the beginning of outbound.js)
var queue_dir = test_queue_dir;

var util_hmailitem = require('./../fixtures/util_hmailitem');
var mock_sock      = require('./../fixtures/line_socket');

// create a dummy HMailItem for testing
util_hmailitem.createHMailItem(
    this, // outbound context
    {

    },
    function (err, hmail) {
        if (err) {
            test.ok(false, 'Could not create HMailItem: ' + err);
            test.done();
            return;
        }
        runBasicSmtpConversation(hmail);
    }
);

var bounce_func_called = false;
HMailItem.prototype.bounce = function (err, opts) {
    test.ok(true, 'HMail bounce called');
    bounce_func_called = true;
}

function runBasicSmtpConversation(hmail) {
    if (!hmail.todo) {
        hmail.once('ready', function () {
            //console.log('hmail ready called');
            _runBasicSmtpConversation(hmail);
        });
    } else {
        _runBasicSmtpConversation(hmail);
    }
}
function _runBasicSmtpConversation(hmail) {
    var mock_socket = mock_sock.connect('testhost', 'testport');
    mock_socket.writable = true;

    // The playbook
    // remote: This line is to be sent (from an mocked remote SMTP) to haraka outbound. This is done in this test.
    // haraka: This string is expected to come from haraka outbound to the mocked remote SMTP via socket.
    //         Can hold a function(line) returning true for success
    var testPlaybook = [
        // Haraka connects, we say first
        { 'from': 'remote', 'line': '220 testing-smtp' },

        { 'from': 'haraka', 'test': function(line) { return line.match(/^EHLO /); }, 'description': 'Haraka should say EHLO', },
        { 'from': 'remote', 'line': '220-testing-smtp' },
        { 'from': 'remote', 'line': '220 8BITMIME' },

        { 'from': 'haraka', 'test': 'MAIL FROM:<sender@domain>' },
        { 'from': 'remote', 'line': '500 5.0.0 Absolutely not acceptable. Basic Test Only.' },

        { 'from': 'haraka', 'test': 'QUIT', end_test: true }, // this will trigger calling the callback
    ];

    util_hmailitem.playTestSmtpConversation(hmail, mock_socket, test, testPlaybook, function() {
        test.ok(bounce_func_called, 'bounce function was called');
        test.done();
    });

}


