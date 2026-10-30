#!/usr/bin/env node
'use strict';

var converter = require('../dist/animate-data-converter.cjs.js');

converter.runCli(process.argv.slice(2), {
	stdout: function (text) { process.stdout.write(text); },
	stderr: function (text) { process.stderr.write(text); }
}).then(function (code) {
	process.exitCode = code;
}, function (error) {
	process.stderr.write((error && error.stack ? error.stack : String(error)) + '\n');
	process.exitCode = 2;
});
