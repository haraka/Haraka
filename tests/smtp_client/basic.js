test.expect(1);
var server = {notes: {}};
exports.get_pool(server);
exports.get_client(server, function(smtp_client) {
    test.equals(1, Object.keys(server.notes.pool).length);
    test.done();
});
