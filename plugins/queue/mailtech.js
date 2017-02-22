/**
 * Created by som on 21/2/17.
 */
const http = require('http');
const querystring = require('querystring');
const Stream = require('stream').Stream;
const Buffer = require('buffer').Buffer;
exports.register = function () {
    this.register_hook('queue', 'queue');
    this.register_hook('queue_outbound', 'queue');
};



exports.queue = function (next, connection) {
/*
    get all data that is required to post to mailtech server
 */
    var transaction = connection.transaction;
    var stream = transaction.message_stream;
    let body = '';
    var mail_from = transaction.mail_from;
    var rcpt_to = transaction.rcpt_to;
    var user = connection.notes.auth_user;
    var password = connection.notes.auth_passwd;
    var auth_method = connection.notes.auth_method;

    stream.on('data',function(chunk){
        body += chunk;
    });

    stream.end = function(){
        /*
        post to mailtech server
         */
        var rcpt_to_array = [];
        rcpt_to.forEach(function(rctp){
            rcpt_to_array.push(rctp.original);
        });
        var postData = querystring.stringify({
            'mail_from' : mail_from.original,
            'body' : body,
            'user' : user,
            'password' : password,
            'auth_method' : auth_method,
            'rcpt_to' : rcpt_to_array
        });

        var req = http.request({
            host: 'localhost',
            port: '8080',
            path: '/sendEmail',
            method: 'POST',
            headers: {
                'Content-Type' : 'application/x-www-form-urlencoded',
                'Content-Length' : Buffer.byteLength(postData)
            }
        }, function(response){
            var data = '';
            var status = response.statusCode;
            response.setEncoding('utf8');
            response.on('data',function(d){
                data += d;
            });

            response.on('end',function(){
                connection.loginfo(data);
            });

            if(status >= 200 && status<400){
                connection.loginfo("accepted message");
                next(OK);
            } else{
                next(DENY);
            }
        });

        req.on('error', (e) => {
            connection.loginfo("errored in requesting to mailtech");
            next(DENYSOFT);
        });

        req.write(postData);
        req.end();
    };

    stream.on('end',function(){
        body += '.\n';
    });

    connection.transaction.message_stream.pipe(stream);
};

