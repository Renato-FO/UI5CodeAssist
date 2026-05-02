"use strict";

const fs = require("fs");
const path = require("path");
const vscode = require("vscode");

const workspaceCache = new Map();

function createSapUi5ProjectDetector() {
  return {
    isSapUi5Document(document) {
      const mode = vscode.workspace
        .getConfiguration("sapui5Autocomplete")
        .get("projectDetection", "auto");

      if (mode === "always") {
        return true;
      }

      if (mode === "disabled") {
        return false;
      }

      if (documentContentLooksSapUi5(document)) {
        return true;
      }

      const workspaceFolder = document.uri
        ? vscode.workspace.getWorkspaceFolder(document.uri)
        : undefined;

      if (workspaceFolder) {
        return workspaceLooksSapUi5(workspaceFolder.uri.fsPath);
      }

      return document.uri?.scheme === "file"
        ? parentFoldersLookSapUi5(path.dirname(document.uri.fsPath))
        : false;
    },
    clearCache() {
      workspaceCache.clear();
    }
  };
}

function workspaceLooksSapUi5(workspacePath) {
  const cacheKey = workspacePath.toLowerCase();
  if (workspaceCache.has(cacheKey)) {
    return workspaceCache.get(cacheKey);
  }

  const detected = hasSapUi5Manifest(workspacePath)
    || hasUi5Yaml(workspacePath)
    || hasSapUi5PackageJson(workspacePath)
    || hasUi5Component(workspacePath)
    || hasUi5XmlViews(workspacePath);

  workspaceCache.set(cacheKey, detected);
  return detected;
}

function parentFoldersLookSapUi5(startPath) {
  let currentPath = startPath;

  while (currentPath && currentPath !== path.dirname(currentPath)) {
    if (workspaceLooksSapUi5(currentPath)) {
      return true;
    }

    currentPath = path.dirname(currentPath);
  }

  return false;
}

function documentContentLooksSapUi5(document) {
  const fileName = document.uri?.fsPath ? path.basename(document.uri.fsPath).toLowerCase() : "";
  const text = document.getText();

  if (fileName === "manifest.json") {
    return /"sap\.app"\s*:/.test(text) || /"sap\.ui5"\s*:/.test(text);
  }

  if (document.languageId === "xml") {
    return /\bxmlns(?::[\w.-]+)?\s*=\s*["']sap\./.test(text)
      || /<(?:[\w.-]+:)?(?:View|FragmentDefinition)\b/.test(text)
      || /\bcontrollerName\s*=\s*["'][\w.]+["']/.test(text);
  }

  return /\bsap\.ui\.define\s*\(/.test(text)
    || /\bsap\.ui\.controller\s*\(/.test(text)
    || /\b[A-Za-z_$][\w$]*\.extend\s*\(\s*["'](?:[\w$]+\.)+/.test(text)
    || /\bsap\.ui\.getCore\s*\(/.test(text)
    || /\bsap\.(?:m|ui|f|tnt|uxap|viz)\./.test(text);
}

function hasSapUi5Manifest(workspacePath) {
  return [path.join(workspacePath, "webapp", "manifest.json"), path.join(workspacePath, "manifest.json")]
    .some((manifestPath) => {
      const manifest = readJsonFile(manifestPath);
      return Boolean(manifest && (manifest["sap.app"] || manifest["sap.ui5"]));
    });
}

function hasUi5Yaml(workspacePath) {
  return [path.join(workspacePath, "ui5.yaml"), path.join(workspacePath, "ui5-local.yaml")]
    .some((filePath) => {
      const content = readTextFile(filePath);
      return Boolean(content && /\bspecVersion\s*:/.test(content) && /\bmetadata\s*:/.test(content));
    });
}

function hasSapUi5PackageJson(workspacePath) {
  const packageJson = readJsonFile(path.join(workspacePath, "package.json"));
  if (!packageJson) {
    return false;
  }

  const allDependencies = Object.assign(
    {},
    packageJson.dependencies || {},
    packageJson.devDependencies || {}
  );
  const scripts = Object.values(packageJson.scripts || {}).join("\n");
  const dependencyNames = Object.keys(allDependencies);

  return dependencyNames.some((name) =>
    name === "@ui5/cli"
      || name.startsWith("@sapui5/")
      || name.startsWith("@openui5/")
      || name.startsWith("@sap/ux-")
  ) || /\bui5\b/.test(scripts);
}

function hasUi5Component(workspacePath) {
  const componentPaths = [
    path.join(workspacePath, "webapp", "Component.js"),
    path.join(workspacePath, "Component.js")
  ];

  return componentPaths.some((filePath) => {
    const content = readTextFile(filePath);
    return Boolean(content && /UIComponent\.extend\s*\(/.test(content));
  });
}

function hasUi5XmlViews(workspacePath) {
  const candidateDirs = [
    path.join(workspacePath, "webapp", "view"),
    path.join(workspacePath, "webapp", "fragment"),
    path.join(workspacePath, "view"),
    path.join(workspacePath, "fragment")
  ];

  return candidateDirs.some((dirPath) => {
    if (!fs.existsSync(dirPath)) {
      return false;
    }

    return fs.readdirSync(dirPath)
      .filter((name) => name.endsWith(".xml"))
      .some((name) => {
        const content = readTextFile(path.join(dirPath, name));
        return Boolean(content && documentTextLooksSapUi5Xml(content));
      });
  });
}

function documentTextLooksSapUi5Xml(text) {
  return /\bxmlns(?::[\w.-]+)?\s*=\s*["']sap\./.test(text)
    || /<(?:[\w.-]+:)?(?:View|FragmentDefinition)\b/.test(text);
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_) {
    return undefined;
  }
}

function readTextFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (_) {
    return "";
  }
}

module.exports = {
  createSapUi5ProjectDetector
};
