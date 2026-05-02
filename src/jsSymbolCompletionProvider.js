"use strict";

const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const { loadUi5Json } = require("./dataLoader");

function createJsSymbolCompletionProvider(context) {
  return {
    provideCompletionItems(document, position) {
      const memberRequest = getMemberCompletionRequest(document, position);
      if (memberRequest) {
        const memberItems = completeMembers(context, document, position, memberRequest);
        if (memberItems) {
          return memberItems;
        }
      }

      const prefix = getSymbolPrefix(document, position);
      if (isAfterDot(document, position) && !prefix.startsWith("sap.")) {
        return undefined;
      }

      const symbols = loadUi5Json(context, "ui5-symbols.json");
      const items = Object.values(symbols)
        .filter((symbol) => shouldIncludeSymbol(symbol, prefix))
        .map((symbol) => createSymbolCompletionItem(symbol, prefix, position));

      return new vscode.CompletionList(items, false);
    }
  };
}

function createJsHoverProvider(context) {
  return {
    provideHover(document, position) {
      const methodHover = getMethodHover(context, document, position);
      if (methodHover) {
        return methodHover;
      }

      return getSymbolHover(context, document, position);
    }
  };
}

function completeMembers(context, document, position, request) {
  const methodsByClass = loadUi5Json(context, "ui5-method-completions.json");
  const possibleTypes = resolveExpressionTypes(context, document, position, request.receiver);
  const methods = collectMethodsForTypes(context, methodsByClass, possibleTypes)
    .concat(shouldIncludeLocalControllerMethods(possibleTypes) ? collectLocalControllerMethods(document) : []);

  if (!methods.length) {
    return undefined;
  }

  const uniqueMethods = dedupeMethods(methods);
  const partial = request.partial.toLowerCase();
  const items = uniqueMethods
    .filter((method) => !partial || method.name.toLowerCase().startsWith(partial))
    .map((method) => createMethodCompletionItem(method, request.range));

  return new vscode.CompletionList(items, false);
}

function getMethodHover(context, document, position) {
  const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z_$][\w$]*/);
  if (!wordRange) {
    return undefined;
  }

  const linePrefix = document.lineAt(position).text.slice(0, wordRange.start.character);
  if (!linePrefix.endsWith(".")) {
    return undefined;
  }

  const receiver = extractReceiverExpression(linePrefix.slice(0, -1));
  if (!receiver) {
    return undefined;
  }

  const methodName = document.getText(wordRange);
  const methodsByClass = loadUi5Json(context, "ui5-method-completions.json");
  const possibleTypes = resolveExpressionTypes(context, document, position, receiver);
  const method = collectMethodsForTypes(context, methodsByClass, possibleTypes).find(
    (candidate) => candidate.name === methodName
  ) || (
    shouldIncludeLocalControllerMethods(possibleTypes)
      ? collectLocalControllerMethods(document).find((candidate) => candidate.name === methodName)
      : undefined
  );

  if (!method) {
    return undefined;
  }

  return new vscode.Hover(createMethodMarkdown(method), wordRange);
}

function getSymbolHover(context, document, position) {
  const symbols = loadUi5Json(context, "ui5-symbols.json");
  const range = document.getWordRangeAtPosition(
    position,
    /[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*/
  );

  if (!range) {
    return undefined;
  }

  const text = document.getText(range);
  const symbol = findSymbolForHover(symbols, text);
  if (!symbol) {
    return undefined;
  }

  return new vscode.Hover(createSymbolMarkdown(symbol), range);
}

function getMemberCompletionRequest(document, position) {
  const linePrefix = document.lineAt(position).text.slice(0, position.character);
  const partialMatch = linePrefix.match(/([A-Za-z_$][\w$]*)?$/);
  const partial = partialMatch ? partialMatch[0] : "";
  const dotIndex = linePrefix.length - partial.length - 1;

  if (dotIndex < 0 || linePrefix[dotIndex] !== ".") {
    return undefined;
  }

  const receiver = extractReceiverExpression(linePrefix.slice(0, dotIndex));
  if (!receiver) {
    return undefined;
  }

  const start = new vscode.Position(position.line, position.character - partial.length);
  return {
    partial,
    receiver,
    range: new vscode.Range(start, position)
  };
}

function extractReceiverExpression(text) {
  const match = text.match(
    /((?:this|sap(?:\.[A-Za-z_$][\w$]*)+|[A-Za-z_$][\w$]*)(?:\.[A-Za-z_$][\w$]*\([^()]*\))*)\s*$/
  );
  return match ? match[1] : "";
}

function resolveExpressionTypes(context, document, position, expression) {
  const methodsByClass = loadUi5Json(context, "ui5-method-completions.json");
  const symbols = loadUi5Json(context, "ui5-symbols.json");
  const parsed = parseCallChain(expression);

  if (!parsed) {
    return [];
  }

  let possibleTypes = resolveBaseTypes(context, document, position, parsed.base, symbols);

  for (const call of parsed.calls) {
    const nextTypes = [];

    for (const typeName of expandTypesWithSubtypes(context, possibleTypes)) {
      const method = (methodsByClass[typeName] || []).find((candidate) => candidate.name === call);
      if (!method) {
        continue;
      }

      if (method.returnType === "this") {
        nextTypes.push(typeName);
      } else {
        nextTypes.push(...normalizeReturnTypes(method.returnType));
      }
    }

    possibleTypes = unique(nextTypes);
  }

  return expandTypesWithSubtypes(context, possibleTypes);
}

function resolveBaseTypes(context, document, position, base, symbols) {
  if (base === "this") {
    return ["sap.ui.core.mvc.Controller"];
  }

  if (symbols[base]) {
    return [base];
  }

  return inferVariableTypes(context, document, position, base, symbols);
}

function inferVariableTypes(context, document, position, variableName, symbols) {
  const text = document.getText(
    new vscode.Range(new vscode.Position(0, 0), position)
  );
  const escapedName = escapeRegExp(variableName);
  const patterns = [
    new RegExp(`(?:const|let|var)\\s+${escapedName}\\s*=\\s*new\\s+(sap(?:\\.[A-Za-z_$][\\w$]*)+)`, "g"),
    new RegExp(`(?:const|let|var)\\s+${escapedName}\\s*=\\s*((?:this|[A-Za-z_$][\\w$]*)(?:\\.[A-Za-z_$][\\w$]*\\([^()]*\\))+);?`, "g")
  ];
  const inferred = [];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      if (symbols[match[1]]) {
        inferred.push(match[1]);
      } else {
        inferred.push(...resolveExpressionTypes(context, document, position, match[1]));
      }
    }
  }

  return unique(inferred);
}

function parseCallChain(expression) {
  const baseMatch = expression.match(/^(this|sap(?:\.[A-Za-z_$][\w$]*)+|[A-Za-z_$][\w$]*)/);
  if (!baseMatch) {
    return undefined;
  }

  const base = baseMatch[1];
  const rest = expression.slice(base.length);
  const calls = [];
  const callPattern = /\.([A-Za-z_$][\w$]*)\([^()]*\)/g;
  let consumed = "";
  let match;

  while ((match = callPattern.exec(rest)) !== null) {
    if (match.index !== consumed.length) {
      return undefined;
    }

    consumed += match[0];
    calls.push(match[1]);
  }

  if (consumed.length !== rest.length) {
    return undefined;
  }

  return { base, calls };
}

function collectMethodsForTypes(context, methodsByClass, typeNames) {
  const seen = new Set();
  const methods = [];

  for (const typeName of expandTypesWithSubtypes(context, typeNames)) {
    for (const method of methodsByClass[typeName] || []) {
      if (seen.has(method.name)) {
        continue;
      }

      seen.add(method.name);
      methods.push(method);
    }
  }

  return methods;
}

function dedupeMethods(methods) {
  const seen = new Set();
  const uniqueMethods = [];

  for (const method of methods) {
    if (seen.has(method.name)) {
      continue;
    }

    seen.add(method.name);
    uniqueMethods.push(method);
  }

  return uniqueMethods;
}

function shouldIncludeLocalControllerMethods(typeNames) {
  return typeNames.includes("sap.ui.core.mvc.Controller");
}

function collectLocalControllerMethods(document) {
  const methods = [];
  const seen = new Set();

  for (const method of parseControllerMethods(document.getText(), "current controller")) {
    addLocalMethod(methods, seen, method);
  }

  for (const baseText of loadRelativeBaseControllerTexts(document)) {
    for (const method of parseControllerMethods(baseText, "base controller")) {
      addLocalMethod(methods, seen, method);
    }
  }

  return methods;
}

function addLocalMethod(methods, seen, method) {
  if (seen.has(method.name)) {
    return;
  }

  seen.add(method.name);
  methods.push(method);
}

function parseControllerMethods(text, sourceLabel) {
  const methods = [];
  const patterns = [
    /(?:\/\*\*([\s\S]*?)\*\/\s*)?([A-Za-z_$][\w$]*)\s*:\s*function\s*\(([^)]*)\)\s*{/g,
    /(?:\/\*\*([\s\S]*?)\*\/\s*)?([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*{/g
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[2];
      if (name === "function" || name === "if" || name === "for" || name === "while") {
        continue;
      }

      methods.push({
        name,
        visibility: "public",
        parameters: parseParameterList(match[3]),
        returnType: parseJsDocReturnType(match[1]),
        description: parseJsDocDescription(match[1]) || `Method from ${sourceLabel}.`,
        deprecated: /@deprecated\b/.test(match[1] || ""),
        source: sourceLabel
      });
    }
  }

  return methods;
}

function loadRelativeBaseControllerTexts(document) {
  if (!document.uri || document.uri.scheme !== "file") {
    return [];
  }

  const text = document.getText();
  const defineMatch = text.match(/sap\.ui\.define\s*\(\s*\[([\s\S]*?)\]\s*,\s*function\s*\(([^)]*)\)/);
  const extendMatch = text.match(/return\s+([A-Za-z_$][\w$]*)\.extend\s*\(/);

  if (!defineMatch || !extendMatch) {
    return [];
  }

  const dependencies = Array.from(defineMatch[1].matchAll(/["']([^"']+)["']/g)).map((match) => match[1]);
  const parameters = defineMatch[2].split(",").map((parameter) => parameter.trim());
  const dependency = dependencies[parameters.indexOf(extendMatch[1])];

  if (!dependency || !dependency.startsWith(".")) {
    return [];
  }

  const filePath = path.resolve(path.dirname(document.uri.fsPath), `${dependency}.js`);
  if (!fs.existsSync(filePath)) {
    return [];
  }

  return [fs.readFileSync(filePath, "utf8")];
}

function parseParameterList(value) {
  if (!value.trim()) {
    return [];
  }

  return value.split(",").map((parameter) => ({
    name: parameter.trim(),
    type: "any"
  }));
}

function parseJsDocDescription(jsDoc) {
  if (!jsDoc) {
    return "";
  }

  return jsDoc
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\*\s?/, "").trim())
    .filter((line) => line && !line.startsWith("@"))
    .join(" ");
}

function parseJsDocReturnType(jsDoc) {
  if (!jsDoc) {
    return "";
  }

  const match = jsDoc.match(/@returns?\s+{([^}]+)}/);
  return match ? match[1].trim() : "";
}

function expandTypesWithSubtypes(context, typeNames) {
  const classes = loadUi5Json(context, "ui5-classes.json");
  const symbols = loadUi5Json(context, "ui5-symbols.json");
  const expanded = [...typeNames];

  for (const typeName of typeNames) {
    for (const [className, classInfo] of Object.entries(classes)) {
      if (classInfo.extends === typeName || symbols[className]?.extends === typeName) {
        expanded.push(className);
      }
    }
  }

  return unique(expanded);
}

function normalizeReturnTypes(returnType) {
  if (!returnType) {
    return [];
  }

  return returnType
    .split("|")
    .map((typeName) => typeName.trim())
    .map((typeName) => typeName.replace(/\[\]$/, ""))
    .map((typeName) => {
      const promiseMatch = typeName.match(/^Promise<(.+)>$/);
      return promiseMatch ? promiseMatch[1].trim() : typeName;
    })
    .filter((typeName) => typeName.startsWith("sap."))
    .filter((typeName) => typeName !== "undefined" && typeName !== "null");
}

function createMethodCompletionItem(method, range) {
  const item = new vscode.CompletionItem(method.name, vscode.CompletionItemKind.Method);
  item.detail = createMethodSignature(method);
  item.documentation = createMethodMarkdown(method);
  item.insertText = new vscode.SnippetString(`${method.name}($1)`);
  item.range = range;
  item.sortText = `0_${method.name}`;

  if (method.deprecated) {
    item.tags = [vscode.CompletionItemTag.Deprecated];
  }

  return item;
}

function createSymbolCompletionItem(symbol, prefix, position) {
  const item = new vscode.CompletionItem(symbol.name, getCompletionKind(symbol.kind));
  item.detail = createSymbolDetail(symbol);
  item.documentation = createSymbolMarkdown(symbol);
  item.insertText = symbol.name;
  item.sortText = `${getSortGroup(symbol.kind)}_${symbol.name}`;

  if (prefix) {
    const start = new vscode.Position(position.line, position.character - prefix.length);
    item.range = new vscode.Range(start, position);
  }

  if (symbol.deprecated) {
    item.tags = [vscode.CompletionItemTag.Deprecated];
  }

  return item;
}

function createMethodMarkdown(method) {
  const markdown = new vscode.MarkdownString();
  markdown.supportHtml = false;
  markdown.appendCodeblock(createMethodSignature(method), "typescript");

  if (method.description) {
    markdown.appendMarkdown(method.description);
  }

  if (method.inheritedFrom) {
    markdown.appendMarkdown(`\n\nInherited from \`${method.inheritedFrom}\`.`);
  }

  if (method.source) {
    markdown.appendMarkdown(`\n\nSource: ${method.source}.`);
  }

  if (method.deprecated) {
    markdown.appendMarkdown("\n\nDeprecated.");
  }

  return markdown;
}

function createSymbolMarkdown(symbol) {
  const markdown = new vscode.MarkdownString();
  markdown.supportHtml = false;
  markdown.appendCodeblock(`${symbol.kind || "symbol"} ${symbol.name}`, "typescript");

  const detail = createSymbolDetail(symbol);
  if (detail) {
    markdown.appendMarkdown(`**${detail}**`);
  }

  if (symbol.description) {
    markdown.appendMarkdown(`\n\n${symbol.description}`);
  }

  if (symbol.deprecated) {
    markdown.appendMarkdown("\n\nDeprecated.");
  }

  return markdown;
}

function createMethodSignature(method) {
  const parameters = (method.parameters || [])
    .map((parameter) => `${parameter.name || "param"}${parameter.optional ? "?" : ""}: ${parameter.type || "any"}`)
    .join(", ");
  const returnType = method.returnType || "void";
  return `${method.name}(${parameters}): ${returnType}`;
}

function createSymbolDetail(symbol) {
  const detailParts = [symbol.kind];

  if (symbol.extends) {
    detailParts.push(`extends ${symbol.extends}`);
  }

  if (symbol.module && symbol.module !== symbol.name) {
    detailParts.push(symbol.module);
  }

  return detailParts.filter(Boolean).join(" | ");
}

function findSymbolForHover(symbols, text) {
  if (symbols[text]) {
    return symbols[text];
  }

  const parts = text.split(".");
  while (parts.length > 1) {
    parts.shift();
    const candidate = parts.join(".");
    if (symbols[candidate]) {
      return symbols[candidate];
    }
  }

  return undefined;
}

function getSymbolPrefix(document, position) {
  const linePrefix = document.lineAt(position).text.slice(0, position.character);
  const match = linePrefix.match(/[A-Za-z_$][\w.$]*$/);
  return match ? match[0] : "";
}

function shouldIncludeSymbol(symbol, prefix) {
  if (!prefix || !prefix.includes(".")) {
    return true;
  }

  return symbol.name.toLowerCase().startsWith(prefix.toLowerCase());
}

function isAfterDot(document, position) {
  const linePrefix = document.lineAt(position).text.slice(0, position.character);
  return /\.[A-Za-z_$]*$/.test(linePrefix);
}

function getCompletionKind(kind) {
  switch (kind) {
    case "class":
    case "control":
    case "element":
      return vscode.CompletionItemKind.Class;
    case "namespace":
      return vscode.CompletionItemKind.Module;
    case "enum":
      return vscode.CompletionItemKind.Enum;
    case "interface":
      return vscode.CompletionItemKind.Interface;
    case "typedef":
    case "type":
      return vscode.CompletionItemKind.TypeParameter;
    default:
      return vscode.CompletionItemKind.Value;
  }
}

function getSortGroup(kind) {
  switch (kind) {
    case "class":
    case "control":
    case "element":
      return "0";
    case "namespace":
      return "1";
    case "enum":
      return "2";
    case "interface":
      return "3";
    default:
      return "4";
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

module.exports = {
  createJsHoverProvider,
  createJsSymbolCompletionProvider
};
