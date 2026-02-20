const assert = require('node:assert')

const { parse } = require('../rfc1869')

function _check(line, expected) {
    const match = /^(MAIL|RCPT)\s+(.*)$/.exec(line)
    const parsed = parse(match[1].toLowerCase(), match[2])
    assert.equal(parsed.length, expected.length)
    for (let x = 0; x < expected.length; x++) {
        assert.equal(parsed[x], expected[x])
    }
}

describe('rfc1869', () => {
    it('MAIL FROM:<>', () => {
        _check('MAIL FROM:<>', ['<>'])
    })

    it('MAIL FROM:', () => {
        _check('MAIL FROM:', ['<>'])
    })

    it('MAIL FROM:<postmaster>', () => {
        _check('MAIL FROM:<postmaster>', ['<postmaster>'])
    })

    it('MAIL FROM:user', () => {
        _check('MAIL FROM:user', ['user'])
    })

    it('MAIL FROM:user size=1234', () => {
        _check('MAIL FROM:user size=1234', ['user', 'size=1234'])
    })

    it('MAIL FROM:user@domain size=1234', () => {
        _check('MAIL FROM:user@domain size=1234', ['user@domain', 'size=1234'])
    })

    it('MAIL FROM:<user@domain> size=1234', () => {
        _check('MAIL FROM:<user@domain> size=1234', ['<user@domain>', 'size=1234'])
    })

    it('MAIL FROM:<user@domain> somekey', () => {
        _check('MAIL FROM:<user@domain> somekey', ['<user@domain>', 'somekey'])
    })

    it('MAIL FROM:<user@domain> somekey other=foo', () => {
        _check('MAIL FROM:<user@domain> somekey other=foo', ['<user@domain>', 'somekey', 'other=foo'])
    })

    it('RCPT TO ugly', () => {
        _check('RCPT TO: 0@mailblog.biz 0=9 1=9', ['<0@mailblog.biz>', '0=9', '1=9'])
    })

    it('RCPT TO:<r86x-ray@emailitin.com> state=1', () => {
        _check('RCPT TO:<r86x-ray@emailitin.com> state=1', ['<r86x-ray@emailitin.com>', 'state=1'])
    })

    it('RCPT TO:<user=name@domain.com> foo=bar', () => {
        _check('RCPT TO:<user=name@domain.com> foo=bar', ['<user=name@domain.com>', 'foo=bar'])
    })

    it('RCPT TO:<postmaster>', () => {
        _check('RCPT TO:<postmaster>', ['<postmaster>'])
    })

    describe('error cases', () => {
        const throwCases = [
            {
                desc: 'MAIL FROM with space inside angle-bracket address',
                args: ['mail', 'FROM:<user@dom ain>'],
            },
            {
                desc: 'RCPT TO with syntax error in address (space in address)',
                args: ['rcpt', 'TO: user @domain bad'],
            },
            {
                desc: 'RCPT TO unknown address (no @ and not postmaster/abuse)',
                args: ['rcpt', 'TO:unknown'],
            },
        ]

        for (const { desc, args } of throwCases) {
            it(`throws: ${desc}`, () => {
                assert.throws(() => parse(...args), Error)
            })
        }
    })

    describe('strict mode', () => {
        it('strict MAIL FROM:<user@domain> accepts angle-bracket address', () => {
            const result = parse('mail', 'FROM:<user@domain.com>', true)
            assert.equal(result[0], '<user@domain.com>')
        })

        it('strict MAIL FROM without angle brackets throws', () => {
            assert.throws(() => parse('mail', 'FROM:user@domain.com', true), Error)
        })

        it('strict RCPT TO:<user@domain> accepts angle-bracket address', () => {
            const result = parse('rcpt', 'TO:<user@domain.com>', true)
            assert.equal(result[0], '<user@domain.com>')
        })

        it('strict RCPT TO without angle brackets throws', () => {
            assert.throws(() => parse('rcpt', 'TO:user@domain.com', true), Error)
        })
    })
})
