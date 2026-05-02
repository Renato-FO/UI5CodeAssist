"use strict";

const vscode = require("vscode");
const { clearUi5DataCache } = require("./dataLoader");
const { createXmlCompletionProvider, createXmlHoverProvider } = require("./xmlCompletionProvider");
const {
  createJsHoverProvider,
  createJsSymbolCompletionProvider
} = require("./jsSymbolCompletionProvider");

function activate(context) {
  const xmlSelector = [
    { language: "xml", scheme: "file" },
    { language: "xml", scheme: "untitled" }
  ];
  const jsSelector = [
    { language: "javascript", scheme: "file" },
    { language: "javascript", scheme: "untitled" },
    { language: "javascriptreact", scheme: "file" },
    { language: "javascriptreact", scheme: "untitled" },
    { language: "typescript", scheme: "file" },
    { language: "typescript", scheme: "untitled" },
    { language: "typescriptreact", scheme: "file" },
    { language: "typescriptreact", scheme: "untitled" }
  ];

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      xmlSelector,
      createXmlCompletionProvider(context),
      "<",
      ":",
      " "
    ),
    vscode.languages.registerCompletionItemProvider(
      jsSelector,
      createJsSymbolCompletionProvider(context),
      "."
    ),
    vscode.languages.registerHoverProvider(xmlSelector, createXmlHoverProvider(context)),
    vscode.languages.registerHoverProvider(jsSelector, createJsHoverProvider(context)),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("sapui5Autocomplete")) {
        clearUi5DataCache();
      }
    })
  );
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};
