// virtual_mta
//------------
// documentation via: `haraka -h virtual_mta`

var outbound	= require('./outbound');
var constants   = require('haraka-constants');
var config      = require('./config');
var ip          = require("ip").address(); //Main ip of local server
var host 	    = require('os').hostname().replace(/\\/, '\\057').replace(/:/, '\\072'); //Server hostname
var vmta = null; 
var cfg;

exports.register = function () {
    var plugin = this;

    plugin.loginfo('VMTA configs are fully loaded.');
    cfg = plugin.config.get('vmta.ini', function () {
        // This closure will be run for each detected update of my_plugin.ini
        // Re-run the outer function again
        plugin.register();
    });
    plugin.loginfo('cfg=' + JSON.stringify(cfg));
};

exports.hook_queue_outbound = function (next, connection) {
    var plugin      = this;
    var transaction = connection.transaction;

    plugin.loginfo("");
    plugin.loginfo("----------- virtual_mta plugin LOG START -----------");

    if( transaction.header.headers.hasOwnProperty('x-vmta') )
    {
        //Get 'x-vmta' from the header
        vmta = transaction.header.headers['x-vmta'][0].replace("\n", "");

        //Check if The specified VMTA is defined in the config file
        if( cfg.hasOwnProperty(vmta) ){
            //Get 'vmta' parameter from the config file
            connection.transaction.notes.outbound_ip   = cfg[vmta].ip;
            connection.transaction.notes.outbound_helo = cfg[vmta].host;

            //Remove parameter from the header
            transaction.remove_header('x-vmta');

            plugin.loginfo("'x-vmta' Found : "+vmta);
        }else{
            plugin.logerror("The specified Virtual VMTA '"+vmta+"' does not exist.");
            return next(DENY, "The specified Virtual VMTA '"+vmta+"' does not exist.");
        }
    }else{
        connection.transaction.notes.outbound_ip   = ip;
        connection.transaction.notes.outbound_helo = host;

        plugin.loginfo("No 'x-vmta' Found.");
    }

    plugin.loginfo("Outbound IP : "+connection.transaction.notes.outbound_ip);
    plugin.loginfo("Outbound HOST : "+connection.transaction.notes.outbound_helo);

    outbound.send_email(connection.transaction, function(retval, msg) {
        switch(retval) {
            case constants.ok:
                return next(OK, msg);
                break;
            case constants.deny:
                return next(DENY, msg);
                break;
            default:
                return next(DENYSOFT, msg);
        }
    });

    plugin.loginfo("----------- virtual_mta plugin LOG END -----------");
    plugin.loginfo("");
};
