module.exports = function (returnValue) {
  function stub() {
    stub.called = true;
    stub.args = arguments;
    stub.thisArg = this;
    return returnValue;
  }

  stub.called = false;

  return stub;
};
