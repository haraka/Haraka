// Simple string signatures

exports.hook_data = function (callback, connection) {
    // enable mail body parsing
    connection.transaction.parse_body = 1;
    callback(CONT);
}

exports.hook_data_post = function (callback, connection) {
    var sigs = this.config.get('data.signatures', 'list');
    
    if (check_sigs(sigs, connection.transaction.body)) {
        return callback(DENY, "Mail matches a known spam signature");
    }
    return callback(CONT);
}

function check_sigs (sigs, body) {
    for (var i=0,l=sigs.length; i < l; i++) {
        if (body.bodytext.indexOf(sigs[i]) != -1) {
            return 1;
        }
    }
    
    for (var i=0,l=body.children.length; i < l; i++) {
        if (check_sigs(sigs, body.children[i])) {
            return 1;
        }
    }
    return 0;
}
