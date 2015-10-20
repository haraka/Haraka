'use strict';

module.exports = function(grunt) {

    grunt.loadNpmTasks('grunt-contrib-clean');
    grunt.loadNpmTasks('grunt-eslint');
    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-version-check');

    // Project configuration.
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        eslint: {
            main: {
                src: ['*.js', 'bin/**/*.js', 'plugins/**/*.js']
            },
            test: {
                src: ['tests/**/*.js'],
            }
        },
        jshint: {
            options: {
                jshintrc: true,
            },
            toplevel:[ '*.js' ],
            bin:     [ 'bin/**/*.js' ],
            plugins: [ 'plugins/**/*.js' ],
            test:    [ 'tests/**/*.js' ],
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

    grunt.registerTask('lint', ['eslint']);
    grunt.registerTask('default', ['eslint']);
};
