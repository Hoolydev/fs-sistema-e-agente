# Sistema FS Soluções Tributárias

Aplicação Next.js/React/TypeScript em produção em https://app.fssolucoestributarias.com.br. Leia o [README principal](../README.md) e [contexto consolidado](../docs/CONTEXTO-ATUAL.md).

## Recursos atuais

- Login Better Auth com PostgreSQL Neon, cadastro fechado, gerenciamento de sessão e alteração de senha.
- PWA com início em Diagnóstico, layouts responsivos e identidade FS navy/dourado.
- Comercial com leads persistidos via webhook, modal e anexos privados.
- Acervo de PDFs compartilhado com o agente interno; APIs autorizadas por sessão ou token/telefone.
- Diagnóstico preliminar por CNPJ e parecer no template FS (indicadores, quatro partes e 17 seções). O relatório de exemplo existe apenas como massa de teste do template; não aparece nas telas.
- Controller com processos reais, revisão (aguardando revisão → revisado/ajustes), histórico e exportação CSV.
- Perfis de acesso com hierarquia: administrador revisor, advogado revisor e inclusão de dados; gestão da equipe em Configurações.
- Página inicial, Painel executivo, Indicadores, Administrativo, Aprovações e Relatórios calculados a partir do Controller. Contabilidade e Jurídico ainda sem registros (estado vazio, sem dados ilustrativos).

Sem credenciais Serpro configuradas, `POST /api/diagnosticos` retorna `503 PROVIDER_NOT_READY`. Não existe acesso anônimo ao acervo nem às APIs de dados.

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
npm run test:controller
npx tsx --test tests/documentos.test.ts
npm run build
```

`npx eslint .` passa sem erros (resta um aviso de `<img>` no logo). Não adicionar `"type": "module"` ao package.json sem revisar a implantação: isso já provocou erro ESM nas APIs da Vercel.

## Mapas e contratos

- [Login, PWA e agente](docs/LOGIN-PWA-AGENTE.md)
- [Controller, perfis de acesso e revisão](docs/CONTROLLER-E-PERFIS.md)
- [Webhook site → Comercial](docs/DIAGNOSTICO-WEBHOOK.md)
- [Template do parecer](docs/PARECER-TEMPLATE.md)
- `lib/diagnostico/`: schema, dados de exemplo, cálculos/blocos e PDF.
- `lib/comercial/`: leads, anexos, validação e persistência.
- `lib/documentos/`: acervo, acesso e auditoria.
- `lib/controller/`: processos, revisão, histórico e indicadores.
- `lib/auth/`, `proxy.ts`: autenticação, perfis/permissões e proteção.

Publicar este diretório no projeto Vercel existente `holy-devops/fs-solucoes-sistema`, com Node 22. `.env*` reais, `.local`, `.vercel` e certificados não são versionados.
