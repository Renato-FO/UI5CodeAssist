"use strict";

const vscode = require("vscode");
const { loadUi5Json } = require("./dataLoader");

function createXmlCompletionProvider(context) {
  return {
    provideCompletionItems(document, position) {
      const textUntilPosition = document.getText(
        new vscode.Range(new vscode.Position(0, 0), position)
      );
      const namespaces = parseNamespaces(document.getText());

      const tagRequest = getXmlTagRequest(document, position);
      if (tagRequest) {
        return completeXmlTags(context, namespaces, tagRequest);
      }

      const attributeRequest = getXmlAttributeRequest(textUntilPosition, position);
      if (attributeRequest) {
        return completeXmlAttributes(context, namespaces, attributeRequest);
      }

      return undefined;
    }
  };
}

function createXmlHoverProvider(context) {
  return {
    provideHover(document, position) {
      const tagContext = getXmlTagContextAtPosition(document, position);
      if (!tagContext) {
        return undefined;
      }

      const namespaces = parseNamespaces(document.getText());
      const namespaceName = namespaces.get(tagContext.prefix);
      if (!namespaceName) {
        return undefined;
      }

      const controlName = `${namespaceName}.${tagContext.localName}`;
      if (tagContext.tagNameRange && tagContext.tagNameRange.contains(position)) {
        const control = loadUi5Json(context, "ui5-xml-controls.json")[controlName];
        return control ? new vscode.Hover(createXmlControlMarkdown(control), tagContext.tagNameRange) : undefined;
      }

      const attributeRange = getXmlAttributeNameRangeAtPosition(document, tagContext, position);
      if (!attributeRange) {
        return undefined;
      }

      const attributeName = document.getText(attributeRange);
      const attribute = findXmlAttribute(context, controlName, attributeName);
      return attribute ? new vscode.Hover(createXmlAttributeMarkdown(attribute), attributeRange) : undefined;
    }
  };
}

function parseNamespaces(xmlText) {
  const namespaces = new Map();
  const namespacePattern = /\bxmlns(?::([A-Za-z_][\w.-]*))?\s*=\s*(['"])(.*?)\2/g;
  let match;

  while ((match = namespacePattern.exec(xmlText)) !== null) {
    namespaces.set(match[1] || "", match[3]);
  }

  return namespaces;
}

function getXmlTagContextAtPosition(document, position) {
  const xmlText = document.getText();
  const offset = document.offsetAt(position);
  const tagStart = xmlText.lastIndexOf("<", offset);
  const tagEnd = xmlText.indexOf(">", tagStart);

  if (tagStart < 0 || tagEnd < offset || tagEnd < tagStart) {
    return undefined;
  }

  const openTagText = xmlText.slice(tagStart, tagEnd + 1);
  if (/^<\s*[!?]/.test(openTagText)) {
    return undefined;
  }

  const tagMatch = openTagText.match(/^<\s*\/?\s*([A-Za-z_][\w.-]*)(?::([A-Za-z_][\w.-]*))?/);
  if (!tagMatch) {
    return undefined;
  }

  const rawTagName = tagMatch[2] ? `${tagMatch[1]}:${tagMatch[2]}` : tagMatch[1];
  const tagNameStartOffset = tagStart + tagMatch[0].lastIndexOf(rawTagName);
  const tagNameEndOffset = tagNameStartOffset + rawTagName.length;

  return {
    localName: tagMatch[2] || tagMatch[1],
    openTagText,
    tagStart,
    openTagRange: new vscode.Range(document.positionAt(tagStart), document.positionAt(tagEnd + 1)),
    prefix: tagMatch[2] ? tagMatch[1] : "",
    tagNameRange: new vscode.Range(
      document.positionAt(tagNameStartOffset),
      document.positionAt(tagNameEndOffset)
    )
  };
}

function getXmlAttributeNameRangeAtPosition(document, tagContext, position) {
  const offset = document.offsetAt(position);
  const relativeOffset = offset - tagContext.tagStart;
  const attributePattern = /\s([A-Za-z_][\w.:-]*)\s*=/g;
  let match;

  while ((match = attributePattern.exec(tagContext.openTagText)) !== null) {
    const nameStart = tagContext.tagStart + match.index + match[0].indexOf(match[1]);
    const nameEnd = nameStart + match[1].length;
    const valueStart = tagContext.tagStart + match.index + match[0].length;
    const nextAttribute = findNextAttributeOffset(tagContext.openTagText, attributePattern.lastIndex);
    const attributeEnd = tagContext.tagStart + (nextAttribute > -1 ? nextAttribute : tagContext.openTagText.length);

    if (offset >= nameStart && offset <= nameEnd) {
      return new vscode.Range(document.positionAt(nameStart), document.positionAt(nameEnd));
    }

    if (offset >= valueStart && offset < attributeEnd && relativeOffset >= 0) {
      return new vscode.Range(document.positionAt(nameStart), document.positionAt(nameEnd));
    }
  }

  return undefined;
}

function findNextAttributeOffset(openTagText, startIndex) {
  const match = openTagText.slice(startIndex).match(/\s[A-Za-z_][\w.:-]*\s*=/);
  return match ? startIndex + match.index : -1;
}

function getXmlTagRequest(document, position) {
  const linePrefix = document.lineAt(position).text.slice(0, position.character);
  const match = linePrefix.match(/<([A-Za-z_][\w.-]*:)?([A-Za-z_][\w.-]*)?$/);

  if (!match || linePrefix.endsWith("</") || linePrefix.endsWith("<?") || linePrefix.endsWith("<!")) {
    return undefined;
  }

  const prefix = match[1] ? match[1].slice(0, -1) : "";
  const partial = match[2] || "";
  const start = new vscode.Position(position.line, position.character - partial.length);

  return {
    prefix,
    partial,
    range: new vscode.Range(start, position)
  };
}

function getXmlAttributeRequest(textUntilPosition, position) {
  const tagStart = textUntilPosition.lastIndexOf("<");
  const lastClose = textUntilPosition.lastIndexOf(">");

  if (tagStart < 0 || tagStart < lastClose) {
    return undefined;
  }

  const openTagText = textUntilPosition.slice(tagStart);
  if (/^<\s*[!?/]/.test(openTagText) || isInsideQuotedValue(openTagText)) {
    return undefined;
  }

  const tagMatch = openTagText.match(/^<\s*([A-Za-z_][\w.-]*)(?::([A-Za-z_][\w.-]*))?/);
  if (!tagMatch) {
    return undefined;
  }

  const tagNameLength = tagMatch[0].length;
  if (openTagText.length <= tagNameLength || !/\s/.test(openTagText.slice(tagNameLength))) {
    return undefined;
  }

  const attributeTail = openTagText.match(/(?:^|\s)([A-Za-z_][\w.:-]*)?$/);
  if (!attributeTail) {
    return undefined;
  }

  const partial = attributeTail[1] || "";
  if (partial.includes("=") || partial.includes("/")) {
    return undefined;
  }

  const prefix = tagMatch[2] ? tagMatch[1] : "";
  const localName = tagMatch[2] || tagMatch[1];
  const existingAttributes = collectExistingAttributes(openTagText);
  const start = new vscode.Position(position.line, position.character - partial.length);

  return {
    existingAttributes,
    localName,
    partial,
    prefix,
    range: new vscode.Range(start, position)
  };
}

function completeXmlTags(context, namespaces, request) {
  const namespaceName = namespaces.get(request.prefix);
  if (!namespaceName) {
    return undefined;
  }

  const xmlControls = loadUi5Json(context, "ui5-xml-controls.json");
  const partial = request.partial.toLowerCase();
  const items = Object.values(xmlControls)
    .filter((control) => control.namespace === namespaceName)
    .filter((control) => !partial || control.tag.toLowerCase().startsWith(partial))
    .map((control) => {
      const item = new vscode.CompletionItem(control.tag, vscode.CompletionItemKind.Class);
      item.detail = control.name;
      item.documentation = createDocumentation(control.description, control);
      item.insertText = control.tag;
      item.range = request.range;
      item.sortText = `0_${control.tag}`;

      if (control.deprecated) {
        item.tags = [vscode.CompletionItemTag.Deprecated];
      }

      return item;
    });

  return new vscode.CompletionList(items, false);
}

function completeXmlAttributes(context, namespaces, request) {
  const namespaceName = namespaces.get(request.prefix);
  if (!namespaceName) {
    return undefined;
  }

  const controlName = `${namespaceName}.${request.localName}`;
  const properties = loadUi5Json(context, "ui5-properties.json")[controlName] || [];
  const events = loadUi5Json(context, "ui5-events.json")[controlName] || [];
  const partial = request.partial.toLowerCase();
  const propertyItems = properties.map((property) =>
    createAttributeCompletionItem(property, "property", request.range, "0")
  );
  const eventItems = events.map((event) =>
    createAttributeCompletionItem(event, "event", request.range, "1")
  );

  const items = propertyItems
    .concat(eventItems)
    .filter((item) => !request.existingAttributes.has(item.label))
    .filter((item) => !partial || item.label.toLowerCase().startsWith(partial));

  return new vscode.CompletionList(items, false);
}

function createAttributeCompletionItem(attribute, kind, range, sortGroup) {
  const itemKind =
    kind === "event" ? vscode.CompletionItemKind.Event : vscode.CompletionItemKind.Property;
  const item = new vscode.CompletionItem(attribute.name, itemKind);
  const detailParts = [];

  if (attribute.type) {
    detailParts.push(attribute.type);
  }

  detailParts.push(kind);

  if (attribute.inheritedFrom) {
    detailParts.push(`from ${attribute.inheritedFrom}`);
  }

  item.detail = detailParts.join(" ");
  item.documentation = createDocumentation(attribute.description, attribute);
  item.insertText = new vscode.SnippetString(`${attribute.name}="$1"`);
  item.range = range;
  item.sortText = `${sortGroup}_${attribute.name}`;

  if (attribute.deprecated) {
    item.tags = [vscode.CompletionItemTag.Deprecated];
  }

  return item;
}

function createDocumentation(description, metadata) {
  const markdown = new vscode.MarkdownString();
  markdown.supportHtml = false;

  if (description) {
    markdown.appendMarkdown(description);
  }

  if (metadata && metadata.inheritedFrom) {
    if (description) {
      markdown.appendMarkdown("\n\n");
    }
    markdown.appendMarkdown(`Inherited from \`${metadata.inheritedFrom}\`.`);
  }

  return markdown;
}

function createXmlControlMarkdown(control) {
  const markdown = new vscode.MarkdownString();
  markdown.supportHtml = false;
  markdown.appendCodeblock(`<${control.tag}>`, "xml");
  markdown.appendMarkdown(`\`${control.name}\``);

  if (control.description) {
    markdown.appendMarkdown(`\n\n${control.description}`);
  }

  if (control.extends) {
    markdown.appendMarkdown(`\n\nExtends \`${control.extends}\`.`);
  }

  if (control.deprecated) {
    markdown.appendMarkdown("\n\nDeprecated.");
  }

  return markdown;
}

function createXmlAttributeMarkdown(attribute) {
  const markdown = new vscode.MarkdownString();
  markdown.supportHtml = false;
  const type = attribute.type ? `: ${attribute.type}` : "";
  markdown.appendCodeblock(`${attribute.name}${type}`, "xml");

  if (attribute.description) {
    markdown.appendMarkdown(attribute.description);
  }

  if (attribute.inheritedFrom) {
    markdown.appendMarkdown(`\n\nInherited from \`${attribute.inheritedFrom}\`.`);
  }

  if (attribute.deprecated) {
    markdown.appendMarkdown("\n\nDeprecated.");
  }

  return markdown;
}

function findXmlAttribute(context, controlName, attributeName) {
  const properties = loadUi5Json(context, "ui5-properties.json")[controlName] || [];
  const events = loadUi5Json(context, "ui5-events.json")[controlName] || [];
  const control = loadUi5Json(context, "ui5-xml-controls.json")[controlName];

  return properties
    .concat(events)
    .concat((control && control.properties) || [])
    .concat((control && control.events) || [])
    .find((attribute) => attribute.name === attributeName);
}

function collectExistingAttributes(openTagText) {
  const existing = new Set();
  const pattern = /\s([A-Za-z_][\w.:-]*)\s*=/g;
  let match;

  while ((match = pattern.exec(openTagText)) !== null) {
    existing.add(match[1]);
  }

  return existing;
}

function isInsideQuotedValue(openTagText) {
  let quote = "";

  for (let index = 0; index < openTagText.length; index += 1) {
    const char = openTagText[index];

    if ((char === '"' || char === "'") && !quote) {
      quote = char;
    } else if (char === quote) {
      quote = "";
    }
  }

  return Boolean(quote);
}

module.exports = {
  createXmlCompletionProvider,
  createXmlHoverProvider,
  parseNamespaces
};
