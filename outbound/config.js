'use strict';

const config = require('haraka-config');
const logger = require('../logger');

exports.name = 'outbound/config'

function load_config () {
    const cfg = exports.cfg = config.get('outbound.ini', {
        booleans: [
            '-disabled',
            '-always_split',
            '+enable_tls',
            '-local_mx_ok',
        ],
    }, () => {
        load_config();
    }).main;

    // legacy config file support. Remove in Haraka 4.0
    if (!cfg.disabled && config.get('outbound.disabled')) {
        cfg.disabled = true;
    }
    if (!cfg.enable_tls && config.get('outbound.enable_tls')) {
        cfg.enable_tls = true;
    }
    if (!cfg.temp_fail_intervals) {
        cfg.temp_fail_intervals = config.get('outbound.temp_fail_intervals');
    }
    if (!cfg.maxTempFailures) {
        cfg.maxTempFailures = config.get('outbound.maxTempFailures') || 13;
    }
    if (!cfg.concurrency_max) {
        cfg.concurrency_max = config.get('outbound.concurrency_max') || 10000;
    }
    if (!cfg.connect_timeout) {
        cfg.connect_timeout = 30;
    }
    if (!cfg.received_header) {
        cfg.received_header = config.get('outbound.received_header') || 'Haraka outbound';
    }

    exports.set_temp_fail_intervals();
}

exports.set_temp_fail_intervals = function () {
    // Set the outbound temp fail intervals (retry times) using the following rules:
    //   1) temp_fail_intervals takes precedence over maxTempFailures if both are specified
    //   2) if temp_fail_intervals is not specified or is illegally specified, then initialize
    //      it with the equivalent times of maxTempFailures using the original 2^N formula
    //   3) the word "none" can be specified if you do not want to retry a temp failure,
    //      equivalent behavior of specifying maxTempFailures=1
    const { cfg } = this;

    // Fallback function to create an array of the original retry times
    function set_old_defaults () {
        cfg.temp_fail_intervals = [];
        for (let i=1; i<cfg.maxTempFailures; i++) {
            cfg.temp_fail_intervals.push(2 ** (i + 5));
        }
    }

    // Helpful error function in case of parsing failure
    function error (i, msg) {
        logger.error(exports, `temp_fail_intervals syntax error parsing element ${i}: ${msg}`);
        logger.warn(exports, 'Setting outbound temp_fail_intervals to old defaults');
        set_old_defaults();
    }

    // If the new value isn't specified, then create the old defaults
    if (!cfg.temp_fail_intervals) {
        return set_old_defaults();
    }

    // If here then turn the text input into an expanded array of intervals (in seconds)
    // i.e, turn "1m,5m*2,1h*3" into [60,300,300,3600,3600,3600]
    // Parse manually to do better syntax checking and provide better failure messages
    const times = [];
    let input = cfg.temp_fail_intervals.replace(/\s+/g, '').toLowerCase();
    if (input.length === 0) return error(0, 'nothing specified');
    if (input === 'none') {
        cfg.temp_fail_intervals = [];
        return;
    }
    input = input.split(',')

    for (let i=0; i<input.length; i++) {
        const delay = input[i].split('*');
        if (delay.length === 1) delay.push(1);
        else if (delay.length === 2) delay[1] = Number(delay[1]);
        else return error(i, 'too many *');
        if (!Number.isInteger(delay[1])) return error(i, 'multiplier is not an integer');

        if (delay[0].length < 2) error(i, 'invalid time span');
        const symbol = delay[0].charAt(delay[0].length - 1);
        let num = Number(delay[0].slice(0, -1));
        if (isNaN(num)) return error(i, 'invalid number or symbol');

        switch (symbol) {
            case 's':
                // do nothing, this is the base unit
                break;
            case 'm':
                num *= 60;
                break;
            case 'h':
                num *= 3600;
                break;
            case 'd':
                num *= 86400;
                break;
            default:
                return error(i, 'invalid time span symbol');
        }
        // Sanity check (what should this number be?)
        if (num < 5) return error(i, 'delay time too small, should be >=5 seconds')
        for (let j = 0; j < delay[1]; j++) {
            times.push(num);
        }
    }

    // One last check, just in case...should never be true
    if (times.length === 0) return error(0, 'unexpected parsing result');

    // If here, success, so actually store the calculated array in the config
    cfg.temp_fail_intervals = times;
}

load_config();
