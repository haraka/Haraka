module.exports = function (grunt) {

    grunt.loadNpmTasks('grunt-contrib-clean');
    grunt.loadNpmTasks('grunt-bower-install-simple');
    grunt.loadNpmTasks('grunt-bower');

    var bpSrc = [];
    var bpDest = [];
    [
        "404.html",
        "apple-touch-icon.png",
        "crossdomain.xml",
        "browserconfig.xml",
        "favicon.ico",
        "robots.txt"
    ].forEach(function (file) {
        bpSrc.push("dist/" + file);
        bpDest.push("html/" + file);
    });

    // Project configuration.
    grunt.initConfig({
        pkg: grunt.file.readJSON('../package.json'),
        'bower-install-simple': {
            options: {
                color: true,
                directory: 'bower_components'
            },
            'prod': {
                options: {
                    production: true
                }
            },
        },
        bower: {
            prod: {
                dest: 'html',
                js_dest: 'html/js/vendor',
                css_dest: 'html/css/vendor',
                fonts_dest: 'html/fonts/vendor',
                options: {
                    expand: false,
                    keepExpandedHierarchy: false,
                    packageSpecific: {
                        bootstrap: {
                            files: [
                                "dist/css/bootstrap.min.css",
                                "dist/css/bootstrap-theme.min.css",
                                "dist/js/bootstrap.min.js"
                            ]
                        },
                        jquery: {
                            files: [
                                "dist/jquery.min.js"
                            ]
                        },
                        "html5-boilerplate": {
                            files: bpSrc
                        }
                    }
                },
            }
        },
        clean: {
            bower: [ 'html/**/vendor' ],
            boilerplate: bpDest,
            // dist: ['node_modules', 'bower_components']
        },
    });

    grunt.registerTask('default', ['bower-install-simple', 'bower']);
};
