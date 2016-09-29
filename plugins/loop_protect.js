'use strict'
// Plugin that avoids loops by injecting header and dropping if already exists

exports.register = function () {
    this.inherits('queue/discard')
    this.register_hook('rcpt','loop_protect')
};

exports.loop_protect = function (next, connection) {

  let config = this.config.get('loop_protect', 'json') || {};
  let hostname = (config.hasOwnProperty('hostname') ? config.hostname : "none")
  let txn = connection.transaction
  let xloop = txn.header.get_decoded('X-Loop')


  if (xloop === null || xloop === '' || xloop !== hostname) {
    connection.logdebug(connection, 'Setting X-Loop: ' + hostname)
    txn.add_header('X-Loop', hostname)
  } else {
    connection.logerror('LOOP DETECTED, DROPPING MESSAGE')
    connection.transaction.notes.discard = true
  }
  next()
}
