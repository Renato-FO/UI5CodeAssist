# Instructions

## Gerar o `.vsix`

Na raiz do projeto, rode:

```bash
npm install
npm run check
npx vsce package
```

O arquivo gerado tera um nome parecido com:

```text
sapui5-code-assist-0.0.1.vsix
```

## Importante

A pasta `data/` nao vai para o Git, mas precisa existir localmente antes de gerar o `.vsix`, porque a extensao usa os JSONs SAPUI5 em runtime.

Estrutura esperada:

```text
data/
  1.136.16/
    ui5-symbols.json
    ui5-classes.json
    ui5-namespaces.json
    ui5-xml-controls.json
    ui5-method-completions.json
    ui5-events.json
    ui5-properties.json
    ui5-libs.json
```

## Instalar o `.vsix` no Cursor

```bash
cursor --install-extension sapui5-code-assist-0.0.1.vsix
```

Se o comando `cursor` nao estiver disponivel, abra o Cursor e use:

```text
Extensions -> ... -> Install from VSIX
```

