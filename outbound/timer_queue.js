'use strict';

var logger = require('../logger');

function TQTimer (fire_time, cb) {
    this.fire_time = fire_time;
    this.cb = cb;
}

TQTimer.prototype.cancel = function () {
    this.cb = null;
};

function TimerQueue (interval) {
    var self = this;
    interval = interval || 1000;
    this.queue = [];
    this.interval_timer = setInterval(function () { self.fire(); }, interval);
}

module.exports = TimerQueue;

TimerQueue.prototype.add = function (ms, cb) {
    var fire_time = Date.now() + ms;

    var timer = new TQTimer(fire_time, cb);

    if ((this.queue.length === 0) ||
        fire_time >= this.queue[this.queue.length - 1].fire_time) {
        this.queue.push(timer);
        return timer;
    }

    for (var i=0; i < this.queue.length; i++) {
        if (this.queue[i].fire_time > fire_time) {
            this.queue.splice(i, 0, timer);
            return timer;
        }
    }

    throw "Should never get here";
};

TimerQueue.prototype.fire = function () {
    if (this.queue.length === 0) return;

    var now = Date.now();

    while (this.queue.length && this.queue[0].fire_time <= now) {
        var to_run = this.queue.shift();
        if (to_run.cb) to_run.cb();
    }
};

TimerQueue.prototype.length = function () {
    return this.queue.length;
};

TimerQueue.prototype.drain = function () {
    logger.logdebug("Draining " + this.queue.length + " items from the queue");
    while (this.queue.length) {
        var to_run = this.queue.shift();
        if (to_run.cb) to_run.cb();
    }
};

TimerQueue.prototype.shutdown = function () {
    clearInterval(this.interval_timer);
}
