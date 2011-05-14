var test = require("tap").test;
require('../configfile').watch_files = false;
var Address = require("../address").Address;

var addresses = [
'<>', {user: null, host: null},
'<postmaster>', {user: 'postmaster', host: null},
'<foo@example.com>', {user: 'foo', host: 'example.com'},
'<"musa_ibrah@caramail.comandrea.luger"@wifo.ac.at>', {user: 'musa_ibrah@caramail.comandrea.luger', host: 'wifo.ac.at'},
'<foo bar@example.com>', {user: 'foo bar', host: 'example.com'},
'foo@example.com', {user: 'foo', host: 'example.com'},
'<foo@foo.x.example.com>', {user: 'foo', host: 'foo.x.example.com'},
'foo@foo.x.example.com', {user: 'foo', host: 'foo.x.example.com'},
];

test("Email Address Parsing", function(t) {
    // t.plan(addresses.length);
    for (var i=1,l=addresses.length; i<l; i = i+2) {
        var addr = new Address(addresses[i-1]);
        var result = addresses[i];
        t.equal(addr.user, result.user, "Check " + addresses[i-1] + " user");
        t.equal(addr.host, result.host, "Check " + addresses[i-1] + " host");
    }
    t.end();
});

var bad_addresses = [
'<user@example.com#>',
]

test("Addresses that fail", function (t) {
    t.plan(bad_addresses.length);
    for (var i=0; i < bad_addresses.length; i++) {
        try {
            var a = new Address(bad_addresses[i]);
            // shouldn't get here...
            t.ok(false, "Parse worked? " + bad_addresses[i])
        }
        catch (e) {
            t.ok(1, "Exception occurred for: " + bad_addresses[i]);
        }
    }
    t.end();
})