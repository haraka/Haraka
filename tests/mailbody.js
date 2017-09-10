const Body   = require('../mailbody').Body;

function _fill_body (body, quote) {
    // Body.bodytext retains the original received text before filters are
    // applied so the filtered text isn't tested against URIBLs, etc.  Since we
    // want to test filter output, we use this hack to pull out the parsed body
    // parts that will be passed onward to the transaction.

    quote = quote || "";

    body.state = 'headers';
    body.parse_more("Content-Type: multipart/alternative; boundary=" + quote + "abcdef" + quote + "\n");
    body.parse_more("From: =?US-ASCII*EN?Q?Keith_Moore?= <moore@cs.utk.edu>\n");
    body.parse_more("\n");
    body.parse_more("--abcdef\n");
    body.parse_more("Content-Type: text/plain; charset=UTF-8; format=flowed;\n");
    body.parse_more(" URL*0=\"ftp://\"\n");
    body.parse_more(" URL*1=\"cs.utk.edu/pub/moore/bulk-mailer/bulk-mailer.tar\"\n");
    body.parse_more(" title*=us-ascii'en-us'This%20is%20%2A%2A%2Afun%2A%2A%2A\n");
    body.parse_more("\n");
    body.parse_more("Some text for your testing pleasure.\n");
    body.parse_more("Yup that was some text all right.\n");
    body.parse_more("\n");
    let text = body.parse_more("--abcdef\n");
    body.parse_more("Content-Type: text/html; charset=UTF-8;\n");
    body.parse_more(" title*0*=us-ascii'en'This%20is%20even%20more%20\n");
    body.parse_more(" title*1*=%2A%2A%2Afun%2A%2A%2A%20\n");
    body.parse_more(" title*2=\"isn't it!\"\n");
    body.parse_more("Content-Disposition: inline; \n");
    body.parse_more("  filename*0=\"marketron_lbasubmission_FTA Cricket Brentwood 3006445\n");
    body.parse_more(" Jackso\"; filename*1=\"n TN_08282017.xlsx\"\n");
    body.parse_more("\n");
    body.parse_more("<p>This is some HTML, yo.<br>\n");
    body.parse_more("It's pretty rad.</p>\n");
    body.parse_more("\n");
    let html = body.parse_more("--abcdef--\n");
    body.parse_end();

    text = text.replace(/--abcdef\n$/, '').trim();
    html = html.replace(/--abcdef--\n$/, '').trim();

    return [text, html];
}

function _fill_empty_body (body) {
    // Body.bodytext retains the original received text before filters are
    // applied so the filtered text isn't tested against URIBLs, etc.  Since we
    // want to test filter output, we use this hack to pull out the parsed body
    // parts that will be passed onward to the transaction.

    body.state = 'headers';
    body.parse_more("Content-Type: multipart/alternative; boundary=abcdef\n");
    body.parse_more("\n");
    body.parse_more("--abcdef\n");
    body.parse_more("Content-Type: text/plain; charset=UTF-8; format=flowed;\n");
    body.parse_more("\n");
    let text = body.parse_more("--abcdef\n");
    body.parse_more("Content-Type: text/html; charset=UTF-8;\n");
    body.parse_more("\n");
    let html = body.parse_more("--abcdef--\n");
    body.parse_end();

    text = text.replace(/--abcdef\n$/, '').trim();
    html = html.replace(/--abcdef--\n$/, '').trim();

    return [text, html];
}

exports.basic = {
    'children': function (test) {
        test.expect(1);

        const body = new Body();
        _fill_body(body);

        test.equal(body.children.length, 2);
        test.done();
    },
};

exports.banners = {
    'banner': function (test) {
        test.expect(2);

        const body = new Body();
        body.set_banner(['A text banner', 'An HTML banner']);
        const parts = _fill_body(body);

        test.ok(/A text banner$/.test(parts[0]));
        test.ok(/<P>An HTML banner<\/P>$/.test(parts[1]));
        test.done();
    },

    'insert_banner': function (test){
        test.expect(2);

        let content_type;
        let buf;
        let new_buf;
        const enc = 'UTF-8';

        const body = new Body();
        const banners = [ 'textbanner', 'htmlbanner' ];

        // this is a kind of roundabout way to get at the insert_banners code
        body.set_banner(banners);
        const insert_banners_fn = body.filters[0];

        content_type = 'text/html';
        buf = new Buffer("winter </html>");
        new_buf = insert_banners_fn (content_type, enc, buf);
        test.equal(new_buf.toString(), "winter <P>htmlbanner</P></html>",
            "html banner looks ok");


        content_type = 'text/plain';
        buf = new Buffer("winter");
        new_buf = insert_banners_fn (content_type, enc, buf);
        test.equal(new_buf.toString(), "winter\ntextbanner\n",
            "text banner looks ok");

        test.done();
    },


    // found and fixed bug, if the buffer is empty this was throwing a:
    // RangeError: out of range index
    'insert_banner_empty_buffer': function (test){
        test.expect(2);

        let content_type;
        let new_buf;
        const enc = 'UTF-8';

        const body = new Body();
        const banners = [ 'textbanner', 'htmlbanner' ];

        // this is a kind of roundabout way to get at the insert_banners code
        body.set_banner(banners);
        const insert_banners_fn = body.filters[0];


        content_type = 'text/html';
        const empty_buf = new Buffer('');
        new_buf = insert_banners_fn (content_type, enc, empty_buf);
        test.equal(new_buf.toString(), "<P>htmlbanner</P>",
            "empty html part gets a banner" );

        content_type = 'text/plain';
        new_buf = insert_banners_fn (content_type, enc, empty_buf);
        test.equal(new_buf.toString(), "\ntextbanner\n",
            "empty text part gets a banner");

        test.done();
    },

    'insert_banner_empty_body': function (test) {
        test.expect(2);

        const body = new Body();
        const banners = [ 'textbanner', 'htmlbanner' ];

        body.set_banner(banners);
        const results = _fill_empty_body(body);

        test.equal(results[0], banners[0]);
        test.equal(results[1], '<P>' + banners[1] + '</P>');

        test.done();
    },
};

exports.filters = {
    'empty': function (test) {
        test.expect(2);

        const body = new Body();
        body.add_filter(function (ct, enc, buf) { });
        const parts = _fill_body(body);

        test.ok(/Some text/.test(parts[0]));
        test.ok(/This is some HTML/.test(parts[1]));
        test.done();
    },

    'search/replace': function (test) {
        test.expect(2);

        const body = new Body();
        body.add_filter(function (ct, enc, buf) {
            if (/^text\/plain/.test(ct)) {
                return new Buffer("TEXT FILTERED");
            }
            else if (/text\/html/.test(ct)) {
                return new Buffer("<p>HTML FILTERED</p>");
            }
        });
        const parts = _fill_body(body);

        test.equal(parts[0], "TEXT FILTERED");
        test.equal(parts[1], "<p>HTML FILTERED</p>");
        test.done();
    },

    'regression: duplicate multi-part preamble when filters added':
    function (test) {
        test.expect(1);

        const body = new Body();
        body.add_filter(function () {});

        let lines = [];

        body.state = 'headers'; // HACK
        [
            "Content-Type: multipart/mixed; boundary=abcd\n",
            "\n",
            "This is a multi-part message in MIME format.\n",
            "--abcd\n",
            "Content-Type: text/plain\n",
            "\n",
            "Testing, 1, 2, 3.\n",
            "--abcd--\n",
        ].forEach(function (line) {
            lines.push(body.parse_more(line));
        });
        lines.push(body.parse_end());

        // Ignore blank lines.
        lines = lines.filter(function (l) {
            return l.trim();
        });

        let dupe = false;
        let line;
        while ((line = lines.pop())) {
            lines.forEach(function (l) {
                dupe = dupe || line === l;
            });
        }

        test.ok(!dupe, 'no duplicate lines found');
        test.done();
    },
};

exports.rfc2231 = {
    'multi-value': function (test) {
        test.expect(2);

        const body = new Body();
        _fill_body(body);

        test.ok(body.children[0].header.get_decoded('content-type').indexOf('URL="ftp://cs.utk.edu/pub/moore/bulk-mailer/bulk-mailer.tar";') > 0);
        test.ok(body.children[1].header.get_decoded('content-disposition').indexOf('filename="marketron_lbasubmission_FTA Cricket Brentwood 3006445 Jackson TN_08282017.xlsx"') > 0);
        test.done();
    },

    'enc-and-lang': function (test) {
        test.expect(1);

        const body = new Body();
        _fill_body(body);

        test.ok(body.children[0].header.get_decoded('content-type').indexOf('title="This is ***fun***";') > 0);
        test.done();
    },

    'multi-value-enc-and-lang': function (test) {
        test.expect(1);

        const body = new Body();
        _fill_body(body);

        test.ok(body.children[1].header.get_decoded('content-type').indexOf('title="This is even more ***fun*** isn\'t it!";') > 0);
        test.done();
    }
};

exports.boundaries = {
    'with-quotes': function (test) {
        test.expect(1);

        const body = new Body();
        _fill_body(body, '"');

        test.equal(body.children.length, 2);
        test.done();
    },

    'without-quotes': function (test) {
        test.expect(1);

        const body = new Body();
        _fill_body(body, "");

        test.equal(body.children.length, 2);
        test.done();
    },

    'with-bad-quotes': function (test) {
        test.expect(1);

        const body = new Body();
        _fill_body(body, "'");

        test.equal(body.children.length, 0);
        test.done();
    }
}
