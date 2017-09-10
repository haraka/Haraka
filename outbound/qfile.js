"use strict";

const my_hostname = require('os').hostname().replace(/\\/, '\\057').replace(/:/, '\\072');
const platform_dot = ((['win32','win64'].indexOf( process.platform ) !== -1) ? '' : '__tmp__') + '.';

let QFILECOUNTER = 0;

const _qfile = module.exports = {
    // File Name Format: $arrival_$nextattempt_$attempts_$pid_$uniquetag_$counter_$host
    name : function (overrides) {
        const o = overrides || {};
        const time = _qfile.time();
        return [
            o.arrival       || time,
            o.next_attempt  || time,
            o.attempts      || 0,
            o.pid           || process.pid,
            o.uid           || _qfile.rnd_unique(),
            _qfile.next_counter(),
            o.host          || my_hostname
        ].join('_');
    },

    time : function () {
        return new Date().getTime();
    },

    next_counter: function () {
        QFILECOUNTER = (QFILECOUNTER < 10000)?QFILECOUNTER+1:0;
        return QFILECOUNTER;
    },

    rnd_unique: function (len) {
        len = len || 6;
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const result = [];
        for (let i = len; i > 0; --i){
            result.push(chars[Math.floor(Math.random() * chars.length)]);
        }
        return result.join('');
    },

    parts : function (filename) {
        if (!filename){
            throw new Error("No filename provided");
        }

        const PARTS_EXPECTED_OLD = 4;
        const PARTS_EXPECTED_CURRENT = 7;
        let p = filename.split('_');

        // bail on unknown split lengths
        if (p.length !== PARTS_EXPECTED_OLD
            && p.length !== PARTS_EXPECTED_CURRENT){
            return null;
        }

        const time = _qfile.time();
        if (p.length === PARTS_EXPECTED_OLD){
            // parse the previous string structure
            // $nextattempt_$attempts_$pid_$uniq.$host
            // 1484878079415_0_12345_8888.mta1.example.com
            // var fn_re = /^(\d+)_(\d+)_(\d+)(_\d+\..*)$/
            // match[1] = $nextattempt
            // match[2] = $attempts
            // match[3] = $pid
            // match[4] = $uniq.$my_hostname
            const fn_re = /^(\d+)_(\d+)_(\d+)_(\d+)\.(.*)$/;
            const match = filename.match(fn_re);
            if (!match){
                return null;
            }
            p = match.slice(1); // grab the capture groups minus the pattern
            p.splice(3,1,_qfile.rnd_unique(),_qfile.next_counter());  // add a fresh UID and counter
            p.unshift(time);  // prepend current timestamp -- potentially inaccurate, but non-critical and shortlived
        }

        return {
            arrival      : parseInt(p[0]),
            next_attempt : parseInt(p[1]),
            attempts     : parseInt(p[2]),
            pid          : parseInt(p[3]),
            uid          : p[4],
            counter      : parseInt(p[5]),
            host         : p[6],
            age          : time - parseInt(p[0])
        };
    },

    platformDOT : platform_dot
};
