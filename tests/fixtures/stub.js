module.exports = function (returnValue) {
    function stub() {
        stub.called = true;
        if (Array.isArray(stub.args)) {
            stub.args.push(arguments);
        }
        else if (stub.args) {
            stub.args = [ stub.args, arguments ];
        }
        else {
            stub.args = arguments;
        }
        stub.thisArg = this;
        return returnValue;
    }

    stub.called = false;

    return stub;
};
