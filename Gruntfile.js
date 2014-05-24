var child = require('child_process'),
    exec = child.exec,
    BIN = './node_modules/.bin/';

module.exports = function(grunt) {

  grunt.loadNpmTasks('grunt-mocha-test');
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-clean');

  grunt.initConfig({
    jshint: {
      options: {
        camelcase: true,
        curly: true,
        eqeqeq: true,
        immed: true,
        indent: 4,
        latedef: 'nofunc',
        newcap: true,
        noarg: true,
        nonew: true,
        undef: true,
        unused: true,
        trailing: true,
        loopfunc: true,
        proto: true,
        node: true,
        '-W015': true,
        '-W030': true,
        '-W104': true, // 'const' is only available in JavaScript 1.7
        '-W068': true  // Wrapping non-IIFE function literals in parens is unnecessary
      },
      src: ['lib/**/*.js']
    },
    // Configure a mochaTest task
    mochaTest: {
      test: {
        options: {
          reporter: 'spec'
        },
        src: ['specs/*.js']
      }
    },
    clean: {
      test: ['_tmp','build','test*']
    },
    coverage: {
      src: []
    }
  });

  var test_tasks = ['clean:test','mochaTest:test'];

  grunt.registerTask('run_coverage', 'generate test coverage report', function() {
    var done = this.async(),
      cmd = BIN + 'istanbul cover --report html ' + BIN + '_mocha -- specs --recursive';

    grunt.log.debug(cmd);
    exec(cmd, function(err, stdout, stderr) {
      if (err) { grunt.fail.fatal(err); }
      if (/No coverage information was collected/.test(stderr)) {
        grunt.fail.warn('No coverage information was collected. Report not generated.');
      } else {
        grunt.log.ok('test coverage report generated to "./coverage/index.html"');
      }
      done();
    });
  });
  
  grunt.registerTask('test', test_tasks);
  grunt.registerTask('coverage', ['clean:test','run_coverage']);
  grunt.registerTask('default', 'test');
};