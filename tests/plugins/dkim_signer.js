'use strict';

const DKIMSignStream = require('../../plugins/dkim_sign').DKIMSignStream;
const Header = require('../../mailheader').Header;

const privateKey = `-----BEGIN RSA PRIVATE KEY-----
MIICXwIBAAKBgQDwIRP/UC3SBsEmGqZ9ZJW3/DkMoGeLnQg1fWn7/zYtIxN2SnFC
jxOCKG9v3b4jYfcTNh5ijSsq631uBItLa7od+v/RtdC2UzJ1lWT947qR+Rcac2gb
to/NMqJ0fzfVjH4OuKhitdY9tf6mcwGjaNBcWToIMmPSPDdQPNUYckcQ2QIDAQAB
AoGBALmn+XwWk7akvkUlqb+dOxyLB9i5VBVfje89Teolwc9YJT36BGN/l4e0l6QX
/1//6DWUTB3KI6wFcm7TWJcxbS0tcKZX7FsJvUz1SbQnkS54DJck1EZO/BLa5ckJ
gAYIaqlA9C0ZwM6i58lLlPadX/rtHb7pWzeNcZHjKrjM461ZAkEA+itss2nRlmyO
n1/5yDyCluST4dQfO8kAB3toSEVc7DeFeDhnC1mZdjASZNvdHS4gbLIA1hUGEF9m
3hKsGUMMPwJBAPW5v/U+AWTADFCS22t72NUurgzeAbzb1HWMqO4y4+9Hpjk5wvL/
eVYizyuce3/fGke7aRYw/ADKygMJdW8H/OcCQQDz5OQb4j2QDpPZc0Nc4QlbvMsj
7p7otWRO5xRa6SzXqqV3+F0VpqvDmshEBkoCydaYwc2o6WQ5EBmExeV8124XAkEA
qZzGsIxVP+sEVRWZmW6KNFSdVUpk3qzK0Tz/WjQMe5z0UunY9Ax9/4PVhp/j61bf
eAYXunajbBSOLlx4D+TunwJBANkPI5S9iylsbLs6NkaMHV6k5ioHBBmgCak95JGX
GMot/L2x0IYyMLAz6oLWh2hm7zwtb0CgOrPo1ke44hFYnfc=
-----END RSA PRIVATE KEY-----`;

/*
Body hash can be simply checked by:

$ echo -e -n 'Hello world!\r\n'| openssl dgst -binary -sha256 | openssl base64
z6TUz85EdYrACGMHYgZhJGvVy5oQI0dooVMKa2ZT7c4=
$ echo -e -n '\r\n' | openssl dgst -binary -sha256 | openssl base64
frcCV1k9oG9oKj3dpUqdJg1PxRT2RSN/XKdLCPjaYaY=
*/

function getValueFromDKIM(dkim_header, key) {
    const kv = dkim_header.split(';');
    for (let i = 0, len = kv.length; i < len; i++) {
        const arr = kv[i].split(/(?<=^[^=]+)=/);
        if (arr[0] === key) {
            return arr[1];
        }
    }
    throw `Key ${key} not found at ${dkim_header}`;
}

exports.sign = {
    'body hash simple': function (test) {
        // took from RFC
        test.expect(1);

        const email = 'Ignored: header\r\n\r\nHi.\r\n\r\nWe lost the game. Are you hungry yet?\r\n\r\nJoe.\r\n';

        const header = new Header();
        header.parse(['Ignored: header']);
        const signer = new DKIMSignStream('selector', 'haraka.top', privateKey, [], header,
            function (n, dkim) {
                test.equal(getValueFromDKIM(dkim, 'bh'), '2jUSOH9NhtVGCQWNr9BrIAPreKQjO6Sn7XIkfJVOzv8=');
                test.done();
            }
        );
        signer.write(Buffer.from(email));
        signer.end();
    },
    'empty body hash simple': function (test) {
        test.expect(1);

        const email = 'Ignored: header\r\n\r\n';

        const header = new Header();
        header.parse(['Ignored: header']);
        const signer = new DKIMSignStream('selector', 'haraka.top', privateKey, [], header,
            function (n, dkim) {
                test.equal(getValueFromDKIM(dkim, 'bh'), 'frcCV1k9oG9oKj3dpUqdJg1PxRT2RSN/XKdLCPjaYaY=');
                test.done();
            }
        );
        signer.write(Buffer.from(email));
        signer.end();
    },
    'body hash simple, two writes': function (test) {
        test.expect(1);

        const header = new Header();
        header.parse(['Ignored: header']);
        const signer = new DKIMSignStream('selector', 'haraka.top', privateKey, [], header,
            function (n, dkim) {
                test.equal(getValueFromDKIM(dkim, 'bh'), '2jUSOH9NhtVGCQWNr9BrIAPreKQjO6Sn7XIkfJVOzv8=');
                test.done();
            }
        );
        signer.write(Buffer.from('Ignored: header\r\n\r\nHi.\r\n\r\nWe lost the game. '));
        signer.write(Buffer.from('Are you hungry yet?\r\n\r\nJoe.\r\n'));
        signer.end();
    },
    'body hash simple, empty lines': function (test) {
        test.expect(1);

        const email = 'Ignored: header\r\n\r\nHi.\r\n\r\nWe lost the game. Are you hungry yet?\r\n\r\nJoe.\r\n\r\n\r\n';

        const header = new Header();
        header.parse(['Ignored: header']);
        const signer = new DKIMSignStream('selector', 'haraka.top', privateKey, [], header,
            function (n, dkim) {
                test.equal(getValueFromDKIM(dkim, 'bh'), '2jUSOH9NhtVGCQWNr9BrIAPreKQjO6Sn7XIkfJVOzv8=');
                test.done();
            }
        );
        signer.write(Buffer.from(email));
        signer.end();
    },
}
