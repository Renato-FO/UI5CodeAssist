"use strict";

const fs = require("fs");
const path = require("path");
const vscode = require("vscode");

const jsonCache = new Map();
const warnedPaths = new Set();

function getUi5DataDir(context) {
  const config = vscode.workspace.getConfiguration("sapui5Autocomplete");
  const version = config.get("version", "1.136.16");
  const dataPath = config.get("dataPath", "data");

  return path.isAbsolute(dataPath)
    ? path.join(dataPath, version)
    : path.join(context.extensionPath, dataPath, version);
}

function loadUi5Json(context, fileName) {
  const filePath = path.join(getUi5DataDir(context), fileName);
  const cacheKey = filePath.toLowerCase();

  if (jsonCache.has(cacheKey)) {
    return jsonCache.get(cacheKey);
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    jsonCache.set(cacheKey, parsed);
    return parsed;
  } catch (error) {
    warnOnce(filePath, error);
    jsonCache.set(cacheKey, {});
    return {};
  }
}

function clearUi5DataCache() {
  jsonCache.clear();
  warnedPaths.clear();
}

function warnOnce(filePath, error) {
  if (warnedPaths.has(filePath)) {
    return;
  }

  warnedPaths.add(filePath);
  vscode.window.showWarningMessage(
    `SAPUI5 Code Assist: could not load ${filePath}: ${error.message}`
  );
}

module.exports = {
  clearUi5DataCache,
  getUi5DataDir,
  loadUi5Json
};
