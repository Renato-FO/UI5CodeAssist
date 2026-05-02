# SAPUI5 Code Assist

Extensao inicial para Cursor/VS Code com autocomplete SAPUI5 baseado nos JSONs locais em `data/<versao>/`.

## Funcionalidades do MVP

- XML tag completion para views/fragments com namespaces `xmlns`, por exemplo `xmlns:m="sap.m"` e `<m:`.
- XML attribute completion para propriedades e eventos, resolvendo a classe pela tag atual.
- Hover em tags e atributos XML com descricao da base SAPUI5.
- JS symbol completion para classes, namespaces, enums, interfaces, typedefs e tipos.
- JS method completion para cadeias simples, por exemplo `this.`, `this.getOwnerComponent().`, `this.getView().` e `this.byId("...").`.
- Hover em simbolos e metodos JS com assinatura, tipo de retorno e descricao.
- Deteccao automatica de projetos/arquivos SAPUI5 para evitar sugestoes em JavaScript/XML nao relacionados.

## Configuracao

```json
{
  "sapui5Autocomplete.version": "1.136.16",
  "sapui5Autocomplete.dataPath": "data",
  "sapui5Autocomplete.projectDetection": "auto"
}
```

O caminho ativo e resolvido como:

```text
${dataPath}/${version}/
```

Quando `dataPath` for relativo, ele e resolvido a partir da raiz da extensao.

`sapui5Autocomplete.projectDetection` aceita:

- `auto`: ativa providers apenas em projetos/arquivos que parecem SAPUI5.
- `always`: ativa providers em todos os arquivos suportados.
- `disabled`: desativa os providers SAPUI5.

A deteccao automatica considera sinais como `manifest.json` com `sap.app`/`sap.ui5`, `ui5.yaml`, `@ui5/cli` no `package.json`, `webapp/Component.js`, XML views/fragments com namespaces `sap.*` e arquivos JS com `sap.ui.define`.

## Rodar em modo debug

1. Abra esta pasta no Cursor ou VS Code.
2. Rode `npm install` se quiser instalar os tipos de desenvolvimento.
3. Pressione `F5` e escolha `Run Extension`.
4. Na janela Extension Development Host, abra uma XML view SAPUI5 e teste `<m:` apos declarar `xmlns:m="sap.m"`.

## Validacao local

```bash
npm run check
```

Esse comando valida sintaxe dos arquivos da extensao. Se `data/1.136.16` existir localmente, tambem confirma que os JSONs esperados parseiam.
