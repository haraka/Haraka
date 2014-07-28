exports.register = function() {
    var plugin = this;

    var load_host_list = function () {
         plugin.loginfo(plugin, "loading host_list");
         plugin.host_list = plugin.config.get('host_list', 'list', load_host_list);
     };
    load_host_list();

    var load_ldap_conf = function() {
        plugin.loginfo("loading rcpt_to.ldap.ini");
        plugin.ldap_conf = plugin.config.get('rcpt_to.ldap.ini', 'ini', load_ldap_conf);
    }
    load_ldap_conf();
};

exports.hook_rcpt = function(next, connection, params) {

  var ldap = require('ldapjs');
  var util = require('util');
  var host_list;
  var plugin = this;
  var domain;

  domain = params[0].host.toLowerCase();
  if (plugin.host_list.indexOf(domain) == -1) {
    connection.loginfo("Recipient domain is not a local domain; skipping ldap checks.", this);
    return next();
  }

  var ar = connection.transaction.results.get('access');
  if (ar.pass.length >= 1) {
    if (ar.pass.indexOf("rcpt_to.access.whitelist") > -1) {
      connection.loginfo("Accepting recipient since its whitelisted already.", this);
      return next();
    }
  }

  var client = ldap.createClient({
    url: plugin.ldap_conf.main.server
  });

  client.bind(plugin.ldap_conf.main.binddn, plugin.ldap_conf.main.bindpw, function(err) {
    connection.logerror('error: ' + err, connection);
  });

  var rcpt = params[0];
  var plain_rcpt = JSON.stringify(rcpt.original).replace('<', '').replace('>', '').replace('"', '').replace('"', '');

  var opts = {
    filter: '(&(objectClass=' + plugin.ldap_conf.main.objectclass + ')(|(mail=' + plain_rcpt  + ')(mailAlternateAddress=' + plain_rcpt + ')))',
    scope: 'sub',
    attributes: ['dn', 'mail', 'mailAlternateAddress']
  };

  this.logdebug("Search filter is: " + util.inspect(opts), connection);

  client.search(plugin.ldap_conf.main.basedn, opts, function(err, res) {
    var items = []
    res.on('searchEntry', function(entry) {
        connection.logdebug('entry: ' + JSON.stringify(entry.object), connection);
        items.push(entry.object);
      });

    res.on('error', function(err) {
        connection.logerror('LDAP search error: ' + err, connection);
      });

    res.on('end', function(result) {
        connection.logdebug('LDAP search results: ' + items.length + ' -- ' + util.inspect(items));

        if (!items.length) {
          return next(DENY, "Sorry - no mailbox here by that name.");
        } else {
          next();
        }

      });

  });
}
