# Sistema FS Soluções Tributárias

Aplicação Next.js/React/TypeScript em produção em https://app.fssolucoestributarias.com.br. Leia o [README principal](../README.md) e [contexto consolidado](../docs/CONTEXTO-ATUAL.md).

## Recursos atuais

- Login Better Auth com PostgreSQL Neon, cadastro fechado, gerenciamento de sessão e alteração de senha.
- PWA com início em Diagnóstico, layouts responsivos e identidade FS navy/dourado.
- Comercial com leads persistidos via webhook, modal e anexos privados.
- Acervo de PDFs compartilhado com o agente interno; APIs autorizadas por sessão ou token/telefone.
- Diagnóstico e parecer demonstrativos com indicadores, quatro partes e 17 seções, exemplo PDF de 11 páginas.
- Outras telas de gestão ainda demonstrativas.

Consultas fiscais reais ainda não estão ativadas: `POST /api/diagnosticos` retorna `503 PROVIDER_NOT_READY`. O PDF demonstrativo também exige login. Não existe acesso anônimo ao acervo.

## Instalação

```sh
npm ci
cp .env.example .env.local
```

Configure banco PostgreSQL de desenvolvimento e segredo de autenticação. Siga [o guia de novo computador](../docs/NOVO-COMPUTADOR.md) para preparar tabelas e criar conta local.

```sh
npm run dev -- --port 3100
npm run typecheck
npm run test:diagnostico
npm run test:comercial
npx tsx --test tests/documentos.test.ts
npm run build
```

O lint global tem apontamentos históricos em componentes demonstrativos; confira os resultados antes de assumir que passou. Não adicionar `"type": "module"` ao package.json sem revisar a implantação: isso já provocou erro ESM nas APIs da Vercel.

## Mapas e contratos

- [Login, PWA e agente](docs/LOGIN-PWA-AGENTE.md)
- [Webhook site → Comercial](docs/DIAGNOSTICO-WEBHOOK.md)
- [Template do parecer](docs/PARECER-TEMPLATE.md)
- `lib/diagnostico/`: schema, dados de exemplo, cálculos/blocos e PDF.
- `lib/comercial/`: leads, anexos, validação e persistência.
- `lib/documentos/`: acervo, acesso e auditoria.
- `lib/auth/`, `proxy.ts`: autenticação e proteção.

Publicar este diretório no projeto Vercel existente `holy-devops/fs-solucoes-sistema`, com Node 22. `.env*` reais, `.local`, `.vercel` e certificados não são versionados.
