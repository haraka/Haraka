var test = require("tap").test;
var parse = require("../rfc1869").parse;
var dump = require('util').inspect;

var p = function (t) {
    var match = /^(MAIL|RCPT)\s+(.*)$/.exec(t);
    var out = parse(match[1].toLowerCase(), match[2]);
    //console.log("in: " + t + ", out: " + dump(out));
    return out;
}

test("Basic rfc1869 tests", function (t) {
    t.equals(p("MAIL FROM:<>")[0], "<>");
    t.equals(p("MAIL FROM:")[0], "<>");
    t.equals(p("MAIL FROM:<postmaster>")[0], '<postmaster>');
    t.equals(p("MAIL FROM:user")[0], 'user');
    t.equals(p("MAIL FROM:user size=1234")[0], 'user');
    t.equals(p("MAIL FROM:user@domain size=1234")[0], 'user@domain');
    t.equals(p("MAIL FROM:<user@domain> size=1234")[1], 'size=1234');
    t.equals(p("MAIL FROM:<user@domain> somekey")[1], 'somekey');
    t.equals(p("MAIL FROM:<user@domain> somekey other=foo")[2], 'other=foo');
    t.end();
});