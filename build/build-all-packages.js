#!/usr/bin/env node
"use strict";
const ts = require("typescript");
const path = require("path");
const utils = require("typescript-utils");

const TSCONFIGS = [
  "tsconfig.json",
  "@glimmer/*/tsconfig.json",
  "@glimmer/*/tests/tsconfig.json"
];

const packages = ts.sys.resolvePath("packages");

const documentRegistry = ts.createDocumentRegistry();
const filesMap = new Map();
function HostBase() {}
HostBase.prototype = ts.sys;
class LanguageServiceHost extends HostBase {
  constructor(fileNames, options) {
    super();
    this.getScriptFileNames = () => fileNames;
    this.getCompilationSettings = () => options;
  }

  getScriptVersion(fileName) {
    let file = getFile(fileName);
    return file && file.version;
  }

  getScriptSnapshot(fileName) {
    let file = getFile(fileName);
    return file && file.snapshot;
  }

  getDefaultLibFileName(options) {
    return ts.getDefaultLibFilePath(options);
  }

  log(s) {
    console.log(s);
  }

  trace(s) {
    console.log(s);
  }

  error(s) {
    console.error(s);
  }
}

ts.sys.readDirectory(packages, undefined, undefined, TSCONFIGS).forEach(typecheck);

function typecheck(configFileName) {
  console.error("checking", configFileName);
  let start = Date.now();
  let parsed = utils.parseConfig(configFileName);
  if (parsed.errors.length > 0) {
    utils.printDiagnostics(parsed.errors);
    return;
  }
  let host = new LanguageServiceHost(parsed.fileNames, parsed.options);
  let languageService = ts.createLanguageService(host);
  let program = languageService.getProgram();
  program.getSourceFiles().forEach(sourceFile => {
    let diagnostics = ts.getPreEmitDiagnostics(program, sourceFile);
    if (diagnostics.length > 0) {
      utils.printDiagnostics(diagnostics);
      return;
    }
  });
  console.error(`done in ${Date.now() - start}ms`);
}

function getFile(fileName) {
  let file = filesMap.get(fileName);
  if (file) return file;
  let content = ts.sys.readFile(fileName);
  if (!content) return;
  let snapshot = ts.ScriptSnapshot.fromString(content);
  file = { version: "1", snapshot };
  filesMap.set(fileName, file);
  return file;
}
