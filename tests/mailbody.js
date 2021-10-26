const Body   = require('../mailbody').Body;

function _fill_body (body, quote) {
    // Body.bodytext retains the original received text before filters are
    // applied so the filtered text isn't tested against URIBLs, etc.  Since we
    // want to test filter output, we use this hack to pull out the parsed body
    // parts that will be passed onward to the transaction.

    quote = quote || "";

    body.state = 'headers';
    body.parse_more(`Content-Type: multipart/alternative; boundary=${quote}abcdef${quote}\n`);
    body.parse_more("From: =?US-ASCII*EN?Q?Keith_Moore?= <moore@cs.utk.edu>\n");
    body.parse_more("\n");
    body.parse_more("--abcdef\n");
    body.parse_more("Content-Type: text/plain; charset=UTF-8; format=flowed;\n");
    body.parse_more(" URL*0=\"ftp://\"\n");
    body.parse_more(" URL*1=\"cs.utk.edu/pub/moore/bulk-mailer/bulk-mailer.tar\"\n");
    body.parse_more(" title*=us-ascii'en-us'This%20is%20%2A%2A%2Afun%2A%2A%2A\n");
    body.parse_more("Content-Transfer-Encoding: quoted-printable\n");
    body.parse_more("\n");
    body.parse_more("Some text for your =\n");
    body.parse_more("testing pleasure.   \n");
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

    text = text.toString().replace(/--abcdef\n$/, '').trim();
    html = html.toString().replace(/--abcdef--\n$/, '').trim();

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

    text = text.toString().replace(/--abcdef\n$/, '').trim();
    html = html.toString().replace(/--abcdef--\n$/, '').trim();

    return [text, html];
}

exports.basic = {
    'children': test => {
        test.expect(1);

        const body = new Body();
        _fill_body(body);

        test.equal(body.children.length, 2);
        test.done();
    },

    'correct mime parsing (#2548)': test => {
        const tests = [
            ['utf-8', '8-bit', Buffer.from("Grüße, Buß\n"), Buffer.from("Grüße, Buß\n")],
            ['utf-8', 'quoted-printable', Buffer.from("Gr=C3=BC=C3=9Fe, Bu=C3=9F\n"), Buffer.from("Grüße, Buß\n")],
            ['utf-8', 'base64', Buffer.from("R3LDvMOfZSwgQnXDnw==\n"), Buffer.from("Grüße, Buß")],
            ['iso-8859-2', '8-bit', Buffer.from([0x50,0xF8,0x69,0x68,0x6C,0x61,0xB9,0x6F,0x76,0x61,0x63,0xED,0x20,0xFA,0x64,0x61,0x6A,0x65,0x0A]), Buffer.from("Přihlašovací údaje\n")],
            ['iso-8859-2', 'quoted-printable', Buffer.from("P=F8ihla=B9ovac=ED =FAdaje\n"), Buffer.from("Přihlašovací údaje\n")],
            ['iso-8859-2', 'base64', Buffer.from("UPhpaGxhuW92YWPtIPpkYWplCgo=\n"), Buffer.from("Přihlašovací údaje\n\n")],
            ['utf-8', '8-bit', Buffer.from("どうぞ宜しくお願い申し上げます"), Buffer.from("どうぞ宜しくお願い申し上げます")]
        ];

        test.expect(tests.length);

        tests.forEach(data => {
            const body = new Body();
            body.add_filter(() => {});

            body.state = 'headers'; // HACK
            [
                "Content-type: multipart/alternative;\n",
                " boundary=------------D0A00162984CC178E2583417\n",
                "\n",
                "This is a multi-part message in MIME format.\n",
                "--------------D0A00162984CC178E2583417\n",
                `Content-Type: text/plain; charset=${data[0]}; format=flowed\n`,
                `Content-Transfer-Encoding: ${data[1]}\n`,
                "\n",
                data[2],
                "--------------D0A00162984CC178E2583417--"
            ].forEach((line) => body.parse_more(line));
            body.parse_end();

            test.equal(data[3], body.children[0].bodytext, `charset: ${data[0]}, encoding: ${data[1]}`);
        });

        test.done();
    },
}

exports.banners = {
    'banner': test => {
        test.expect(2);

        const body = new Body();
        body.set_banner(['A text banner', 'An HTML banner']);
        const parts = _fill_body(body);

        test.ok(/A text banner$/.test(parts[0]));
        test.ok(/<P>An HTML banner<\/P>$/.test(parts[1]));
        test.done();
    },

    'insert_banner': test => {
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
        buf = Buffer.from("winter </html>");
        new_buf = insert_banners_fn (content_type, enc, buf);
        test.equal(new_buf.toString(), "winter <P>htmlbanner</P></html>",
            "html banner looks ok");


        content_type = 'text/plain';
        buf = Buffer.from("winter");
        new_buf = insert_banners_fn (content_type, enc, buf);
        test.equal(new_buf.toString(), "winter\ntextbanner\n",
            "text banner looks ok");

        test.done();
    },


    // found and fixed bug, if the buffer is empty this was throwing a:
    // RangeError: out of range index
    'insert_banner_empty_buffer': test => {
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
        const empty_buf = Buffer.from('');
        new_buf = insert_banners_fn (content_type, enc, empty_buf);
        test.equal(new_buf.toString(), "<P>htmlbanner</P>",
            "empty html part gets a banner" );

        content_type = 'text/plain';
        new_buf = insert_banners_fn (content_type, enc, empty_buf);
        test.equal(new_buf.toString(), "\ntextbanner\n",
            "empty text part gets a banner");

        test.done();
    },

    'insert_banner_empty_body': test => {
        test.expect(2);

        const body = new Body();
        const banners = [ 'textbanner', 'htmlbanner' ];

        body.set_banner(banners);
        const results = _fill_empty_body(body);

        test.equal(results[0], banners[0]);
        test.equal(results[1], `<P>${banners[1]}</P>`);

        test.done();
    },
}

exports.filters = {
    'empty': test => {
        test.expect(2);

        const body = new Body();
        body.add_filter((ct, enc, buf) => { });
        const parts = _fill_body(body);

        test.ok(/Some text/.test(parts[0]));
        test.ok(/This is some HTML/.test(parts[1]));
        test.done();
    },

    'search/replace': test => {
        test.expect(2);

        const body = new Body();
        body.add_filter((ct, enc, buf) => {
            if (/^text\/plain/.test(ct)) {
                return Buffer.from("TEXT FILTERED");
            }
            else if (/text\/html/.test(ct)) {
                return Buffer.from("<p>HTML FILTERED</p>");
            }
        });
        const parts = _fill_body(body);

        test.equal(parts[0], "TEXT FILTERED");
        test.equal(parts[1], "<p>HTML FILTERED</p>");
        test.done();
    },

    'regression: duplicate multi-part preamble when filters added':
    test => {
        test.expect(1);

        const body = new Body();
        body.add_filter(() => {});

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
        ].forEach(line => {
            lines.push(body.parse_more(line));
        });
        lines.push(body.parse_end());

        // Ignore blank lines.
        lines = lines.filter(l => l.toString().trim());

        let dupe = false;
        let line;
        while ((line = lines.pop())) {
            lines.forEach(l => {
                dupe = dupe || line === l;
            });
        }

        test.ok(!dupe, 'no duplicate lines found');
        test.done();
    },
}

exports.rfc2231 = {
    'multi-value': test => {
        test.expect(2);

        const body = new Body();
        _fill_body(body);

        test.ok(body.children[0].header.get_decoded('content-type').indexOf('URL="ftp://cs.utk.edu/pub/moore/bulk-mailer/bulk-mailer.tar";') > 0);
        test.ok(body.children[1].header.get_decoded('content-disposition').indexOf('filename="marketron_lbasubmission_FTA Cricket Brentwood 3006445 Jackson TN_08282017.xlsx"') > 0);
        test.done();
    },

    'enc-and-lang': test => {
        test.expect(1);

        const body = new Body();
        _fill_body(body);

        test.ok(body.children[0].header.get_decoded('content-type').indexOf('title="This is ***fun***";') > 0);
        test.done();
    },

    'multi-value-enc-and-lang': test => {
        test.expect(1);

        const body = new Body();
        _fill_body(body);

        test.ok(body.children[1].header.get_decoded('content-type').indexOf('title="This is even more ***fun*** isn\'t it!";') > 0);
        test.done();
    }
}

exports.boundaries = {
    'with-quotes': test => {
        test.expect(1);

        const body = new Body();
        _fill_body(body, '"');

        test.equal(body.children.length, 2);
        test.done();
    },

    'without-quotes': test => {
        test.expect(1);

        const body = new Body();
        _fill_body(body, "");

        test.equal(body.children.length, 2);
        test.done();
    },

    'with-bad-quotes': test => {
        test.expect(1);

        const body = new Body();
        _fill_body(body, "'");

        test.equal(body.children.length, 0);
        test.done();
    }
}
