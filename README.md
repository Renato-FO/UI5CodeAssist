# SAPUI5 Code Assist

<p align="center">
  <img src="assets/icon.png" width="96" height="96" alt="SAPUI5 Code Assist icon">
</p>

SAPUI5 Code Assist brings focused autocomplete and hover documentation to Cursor and Visual Studio Code for SAPUI5 XML views, fragments, and JavaScript files.

The extension uses a local SAPUI5 metadata index stored in `data/<version>/`, so completions are fast and available without scraping online documentation.

## Features

- XML tag completion for SAPUI5 views and fragments, including namespace-aware suggestions such as `xmlns:m="sap.m"` and `<m:`.
- XML attribute completion for control properties and events, resolved from the current tag.
- Hover documentation for XML tags and attributes.
- JavaScript symbol completion for classes, namespaces, enums, interfaces, typedefs, and related UI5 types.
- JavaScript method completion for common controller chains such as `this.`, `this.getOwnerComponent().`, `this.getView().`, and `this.byId("...").`.
- Hover documentation for JavaScript symbols and methods, including signatures and return types when available.
- Automatic SAPUI5 project detection to avoid showing UI5 suggestions in unrelated XML and JavaScript files.

## Configuration

```json
{
  "sapui5Autocomplete.version": "1.136.16",
  "sapui5Autocomplete.dataPath": "data",
  "sapui5Autocomplete.projectDetection": "auto"
}
```

The active data directory is resolved as:

```text
${dataPath}/${version}/
```

When `dataPath` is relative, it is resolved from the extension root.

`sapui5Autocomplete.projectDetection` supports:

- `auto`: enable providers only in files or workspaces that look like SAPUI5 projects.
- `always`: enable providers in every supported file type.
- `disabled`: turn SAPUI5 providers off.

Automatic detection looks for common SAPUI5 signals such as `manifest.json` with `sap.app` or `sap.ui5`, `ui5.yaml`, `@ui5/cli` in `package.json`, `webapp/Component.js`, XML namespaces starting with `sap.`, and JavaScript files using `sap.ui.define`.

## Development

1. Open this folder in Cursor or Visual Studio Code.
2. Run `npm install` if development dependencies are not installed yet.
3. Press `F5` and choose `Run Extension`.
4. In the Extension Development Host, open a SAPUI5 XML view and test tag completion after declaring a namespace, for example `xmlns:m="sap.m"` and `<m:`.

## Validation

```bash
npm run check
```

This command validates the extension source files. If `data/1.136.16` exists locally, it also checks that the expected SAPUI5 JSON files can be parsed.
