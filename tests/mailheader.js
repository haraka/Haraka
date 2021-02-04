const Header   = require('../mailheader').Header;

const lines = [
    'Return-Path: <helpme@gmail.com>',
    'Received: from [1.1.1.1] ([2.2.2.2])',
    '       by smtp.gmail.com with ESMTPSA id abcdef.28.2016.03.31.12.51.37',
    '       for <foo@bar.com>',
    '       (version=TLSv1/SSLv3 cipher=OTHER);',
    '       Thu, 31 Mar 2016 12:51:37 -0700 (PDT)',
    'From: Matt Sergeant <helpme@gmail.com>',
    `FromUTF8: =?UTF-8?B?S29obOKAmXM=?=
 <Kohls@s.kohls.com>`,
    'Content-Type: multipart/alternative;',
    '   boundary=Apple-Mail-F2C5DAD3-7EB3-409D-9FE0-135C9FD43B69',
    'Content-Type2: multipart/mixed; boundary="nqp=nb64=()I9WT8XjoN"',
    'Content-Transfer-Encoding: 7bit',
    'Mime-Version: 1.0 (1.0)',
    'Subject: Re: Haraka Rocks!',
    'Message-Id: <616DF75E-D799-4F3C-9901-1642B494C45D@gmail.com>',
    'Date: Thu, 31 Mar 2016 15:51:36 -0400',
    'To: The World <world@example.com>',
    'X-Mailer: iPhone Mail (13E233)',
];

for (let i=0; i<lines.length; i++) {
    lines[i] = `${lines[i]  }\n`;
}

function _set_up (done) {
    this.h = new Header()
    this.h.parse(lines)
    done();
}

exports.parse = {
    setUp: _set_up,
    'get_decoded' (test) {
        test.expect(3);
        test.equal(this.h.lines().length, 13);
        test.equal(
            this.h.get_decoded('content-type'),
            'multipart/alternative;   boundary=Apple-Mail-F2C5DAD3-7EB3-409D-9FE0-135C9FD43B69'
        );
        test.equal(this.h.get_decoded('fromUTF8'), 'Kohl’s <Kohls@s.kohls.com>');
        test.done();
    },
    'content type w/parens' (test) {
        test.expect(2);
        test.equal(this.h.lines().length, 13);
        const ct = this.h.get_decoded('content-type2');
        test.equal(ct, 'multipart/mixed; boundary="nqp=nb64=()I9WT8XjoN"');
        test.done();
    }
}

exports.add_headers = {
    setUp: _set_up,
    add_basic (test) {
        test.expect(2);
        this.h.add('Foo', 'bar');
        test.equal(this.h.lines()[0], 'Foo: bar\n');
        this.h.add_end('Fizz', 'buzz');
        test.equal(this.h.lines()[14], 'Fizz: buzz\n');
        test.done();
    },
    add_utf8 (test) {
        test.expect(4);
        this.h.add('Foo', 'bøø');
        test.equal(this.h.lines()[0], 'Foo: =?UTF-8?Q?b=C3=B8=C3=B8?=\n');
        test.equal(this.h.get_decoded('Foo'), 'bøø');
        // test wrapping
        this.h.add('Bar', 'bøø 1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890');
        test.equal(this.h.lines()[0], 'Bar: =?UTF-8?Q?b=C3=B8=C3=B8?= 1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890\n');
        test.equal(this.h.get_decoded('Bar'), 'bøø 1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890');
        test.done();
    }
}

exports.continuations = {
    setUp: _set_up,
    continuations_decoded (test) {
        test.expect(1);
        test.ok(!/\n/.test(this.h.get_decoded('content-type')));
        test.done();
    }
}

exports.remove = {
    setUp: _set_up,
    'removes only specified header' (test) {
        test.expect(3)
        this.h.add('X-Test', 'remove-me')
        this.h.add('X-Test-1', 'do-not-remove-me')
        this.h.remove('X-Test')
        test.equal(this.h.get('X-Test'), '')
        test.equal(this.h.get('X-Test-1'), 'do-not-remove-me')
        test.ok(this.h.header_list.find(name => name === 'X-Test-1: do-not-remove-me\n'));
        test.done()
    }
}

exports.decode = {
    'multiline 8bit header (#2675)': test => {
        test.expect(1);
        this.h = new Header();
        this.h.parse ([
            "Content-Disposition: attachment;\n",
            " filename*0*=utf-8''%E8%AC%9B%E6%BC%94%E4%BC%9A%E6;\n",
            " filename*1*=%A1%88%E5%86%85%E6%9B%B8%EF%BC%86%E7%94%B3%E8%BE%BC%E6%9B%B8;\n",
            " filename*2*=%E6%94%B9%2Etxt\n"
        ]);
        console.log(this.h.get_decoded('content-disposition'));
        test.ok(this.h.get_decoded('content-disposition').includes('講演会案内書＆申込書改.txt'));
        test.done();
    },
    'unfolding (#2702)': test => {
        test.expect(1);
        this.h = new Header();
        this.h.parse ([
            "Subject: =?UTF-8?Q?Die_beliebtesten_CAD-_und_AVA-Programme;_die_kl=C3=BCgsten_K?=\n",
            " =?UTF-8?Q?=C3=B6pfe_der_Branche;_Abschluss_eines_BIM-Pilotprojekts;_Bauen?=\n",
            " =?UTF-8?Q?_in_Zeiten_des_Klimawandels;_u.v.m?=\n"
        ]);
        test.equal(this.h.get_decoded('subject'), 'Die beliebtesten CAD- und AVA-Programme; die klügsten Köpfe der Branche; Abschluss eines BIM-Pilotprojekts; Bauen in Zeiten des Klimawandels; u.v.m');
        test.done();
    }
}
