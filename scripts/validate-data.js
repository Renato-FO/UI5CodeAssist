"use strict";

const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "..", "data", "1.136.16");
const requiredFiles = [
  "ui5-symbols.json",
  "ui5-classes.json",
  "ui5-namespaces.json",
  "ui5-xml-controls.json",
  "ui5-method-completions.json",
  "ui5-events.json",
  "ui5-properties.json",
  "ui5-libs.json"
];

if (!fs.existsSync(dataDir)) {
  console.warn(`SAPUI5 data directory not found, skipping data validation: ${dataDir}`);
  process.exit(0);
}

for (const fileName of requiredFiles) {
  const filePath = path.join(dataDir, fileName);
  const content = fs.readFileSync(filePath, "utf8");
  JSON.parse(content);
}

console.log(`Validated ${requiredFiles.length} SAPUI5 data files in ${dataDir}`);
