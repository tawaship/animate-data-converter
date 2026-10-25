#!/usr/bin/env node
'use strict';

var converter = require('../dist/animate-data-converter.cjs.js');

process.exitCode = converter.runCli(process.argv.slice(2), {
	stdout: function (text) { process.stdout.write(text); },
	stderr: function (text) { process.stderr.write(text); }
});
