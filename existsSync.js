
var versions   = process.version.split('.');
var version    = Number(versions[0].substring(1));
var subversion = Number(versions[1]);

module.exports = require((version > 0 || subversion >= 8) ? 'fs' : 'path').existsSync;
