# SAPUI5 Code Assist

Extensao inicial para Cursor/VS Code com autocomplete SAPUI5 baseado nos JSONs locais em `data/<versao>/`.

## Funcionalidades do MVP

- XML tag completion para views/fragments com namespaces `xmlns`, por exemplo `xmlns:m="sap.m"` e `<m:`.
- XML attribute completion para propriedades e eventos, resolvendo a classe pela tag atual.
- Hover em tags e atributos XML com descricao da base SAPUI5.
- JS symbol completion para classes, namespaces, enums, interfaces, typedefs e tipos.
- JS method completion para cadeias simples, por exemplo `this.`, `this.getOwnerComponent().`, `this.getView().` e `this.byId("...").`.
- Hover em simbolos e metodos JS com assinatura, tipo de retorno e descricao.

## Configuracao

```json
{
  "sapui5Autocomplete.version": "1.136.16",
  "sapui5Autocomplete.dataPath": "data"
}
```

O caminho ativo e resolvido como:

```text
${dataPath}/${version}/
```

Quando `dataPath` for relativo, ele e resolvido a partir da raiz da extensao.

## Rodar em modo debug

1. Abra esta pasta no Cursor ou VS Code.
2. Rode `npm install` se quiser instalar os tipos de desenvolvimento.
3. Pressione `F5` e escolha `Run Extension`.
4. Na janela Extension Development Host, abra uma XML view SAPUI5 e teste `<m:` apos declarar `xmlns:m="sap.m"`.

## Validacao local

```bash
npm run check
```

Esse comando valida sintaxe dos arquivos da extensao e confirma que os JSONs esperados existem e parseiam.
