// Log class

var logger = exports;

logger.log = function (data) {
    data = data.replace(/\n?$/, "");
    console.log(data);
};
