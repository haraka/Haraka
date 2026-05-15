'use strict'

// SUNSET 2027: Haraka core constructs envelope addresses with
// @haraka/email-address, whose `.address` / `.host` are string
// properties. Core itself — and a large body of bundled and
// third-party plugins — still use the historical address-rfc2821 /
// address-rfc2822 *method* contract (`addr.address()`, `addr.host()`).
//
// `asLegacy()` wraps each instance so both the new string-property API
// and the legacy callable form work during the transition. The wrap is
// idempotent, and `unwrapLegacy()` recovers the raw instance so the
// outbound queue's JSON re-hydration copies primitive string fields
// rather than the callable accessors.
//
// Once the ecosystem has migrated, delete this module, require
// `Address` straight from '@haraka/email-address', and drop the wrapper
// (see @haraka/email-address lib/legacy.js).

const { Address: BaseAddress, asLegacy, unwrapLegacy } = require('@haraka/email-address')

class Address extends BaseAddress {
    constructor(...args) {
        // never re-hydrate from a wrapped instance — copy raw strings
        if (args.length) args[0] = unwrapLegacy(args[0])
        // `new Address(user, host)` where `host` is another wrapped
        // address's `.host` — the SUNSET-2027 callable accessor is
        // `typeof 'function'`, which BaseAddress would mistake for an
        // options object. Coerce it back to the primitive string.
        if (args.length >= 2 && typeof args[1] === 'function') {
            args[1] = String(args[1])
        }
        super(...args)
        return asLegacy(this)
    }

    // Preserve the address-rfc2821 wire shape so existing on-disk queue
    // files stay byte-compatible across the upgrade and re-hydrate
    // unchanged. @haraka/email-address additionally carries
    // phrase/comment/group/opts, which are irrelevant to envelope
    // addresses and must not leak into the persisted todo. SUNSET 2027.
    toJSON() {
        const out = {
            original: this.original,
            original_host: this.original_host,
            host: this.host,
            user: this.user,
        }
        if (this.is_utf8) out.is_utf8 = true
        return out
    }
}

module.exports = { Address }
