module.exports = function(grunt) {

    grunt.loadNpmTasks('grunt-contrib-clean');
    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-version-check');

    // Project configuration.
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        jshint: {
            options: {
                jshintrc: true,
            },
            toplevel:[ '*.js' ],
            bin:     [ 'bin/**/*.js' ],
            plugins: [ 'plugins/**/*.js' ],
            test:    [ 'tests/**/*.js' ],
            all:     [ '<%= jshint.nosql %>', '<%= jshint.test %>' ],
        },
        clean: {
            cruft: ['npm-debug.log'],
            dist: [ 'node_modules' ]
        },
        versioncheck: {
            options: {
              skip : ['semver', 'npm'],
              hideUpToDate : false
            }
        },
    });

    grunt.registerTask('default', ['jshint']);
};
