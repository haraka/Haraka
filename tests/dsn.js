'use strict';

var constants    = require('haraka-constants');

constants.import(global);

function _set_up (done) {
    this.DSN = require('../dsn');

    done();
}

function _tear_down (done) {
    done();
}

exports.dsn = {
    setUp : _set_up,
    tearDown : _tear_down,
    'create, only code' : function (test) {
        test.expect(1);
        test.deepEqual({
            code: 200, msg: undefined, cls: 2, sub: 0, det: 0,
            default_msg: 'Other undefined status',
            reply: '2.0.0 Other undefined status'
        },
        this.DSN.create(200)
        );
        test.done();
    },
    'create, code w/msg' : function (test) {
        test.expect(1);
        test.deepEqual({
            code: 200, msg: 'test msg', cls: 2, sub: 0, det: 0,
            default_msg: 'Other undefined status',
            reply: '2.0.0 test msg'
        },
        this.DSN.create(200, 'test msg')
        );
        test.done();
    },
    'create, code w/msg & subject' : function (test) {
        test.expect(1);
        test.deepEqual({
            code: 200, msg: 'test msg', cls: 2, sub: 7, det: 0,
            default_msg: 'Other or undefined security status',
            reply: '2.7.0 test msg'
        },
        this.DSN.create(200, 'test msg', 7)
        );
        test.done();
    },
};
