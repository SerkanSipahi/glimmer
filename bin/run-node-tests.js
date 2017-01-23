#!/usr/bin/env node

var QUnit = global.QUnit = require('qunitjs');
var path = require('path');
var glob = require('glob');

var count = 0;
QUnit.log(function( details ) {
  count++;
  var message = details.result ? "ok " : "not ok ";
  message += count + " "
  message += details.module + " - " + details.name;
  if (details.message) {
    message += ": " + details.message;
  }
  console.log(message);
});

QUnit.done(function( details ) {
  console.log("1.." + count);
  if (details.failed) {
    process.exit(1);
  }
});

glob.sync('./dist/node_modules/@glimmer/node/tests/**/*-test.js').forEach(function(file) {
  require(path.resolve(file));
});

QUnit.load();
