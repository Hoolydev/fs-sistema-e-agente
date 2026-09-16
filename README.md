# FS — Sistema e agente de diagnóstico tributário

Código e contexto para continuar o projeto em outro computador. Estado consolidado em **16/09/2026**.

- **Sistema:** https://app.fssolucoestributarias.com.br
- **Endereço anterior compatível:** https://fs-solucoes-sistema.vercel.app
- **Site institucional:** https://www.fssolucoestributarias.com.br (projeto separado).
- **Repositório:** https://github.com/Hoolydev/fs-sistema-e-agente

## Comece por aqui

1. Leia [o contexto atual e as pendências](docs/CONTEXTO-ATUAL.md).
2. Siga [a instalação em outro computador](docs/NOVO-COMPUTADOR.md).
3. Consulte [a operação e os ambientes publicados](docs/OPERACAO.md).
4. Para continuar com Claude/Codex, use [a instrução de retomada](docs/RETOMADA-IA.md).

## Organização

| Pasta | Conteúdo |
| --- | --- |
| `sistema-fs/` | Next.js, login, PWA, Comercial, diagnóstico, parecer PDF e acervo compartilhado |
| `automacao-ecac/` | Agente WhatsApp, Z-API/Meta, OpenAI, fila BullMQ, worker, adaptadores RPA/Serpro e Docker |
| `conector-mac/` | Cópia versionável do conector Mac, pipeline e ponte VPS, sem estado ou credenciais |
| `arquitetura/` | Documentos históricos de planejamento; conferir o estado atual antes de implementar |
| `docs/` | Handoff, implantação, dependências privadas e próximos passos |

## O que funciona hoje

- Login próprio FS com Better Auth e PostgreSQL Neon; cadastro público fechado.
- PWA com abertura em Diagnóstico, interface responsiva e identidade navy/dourado.
- Formulário do site → webhook autenticado → Comercial → Novos contatos.
- Contatos persistidos, anexos PDF e acervo com busca por empresa/CNPJ.
- Parecer demonstrativo seguindo o modelo do cliente: indicadores, quatro partes e 17 seções; exemplo de 11 páginas com identidade FS.
- API privada para o agente recuperar documentos existentes e arquivar novos PDFs, com autorização por token e telefone.
- Reenvio de documento existente sem refazer consulta fiscal, implementado e testado em simulação.

**Não confundir com operação fiscal concluída:** o diagnóstico real pelo sistema ainda responde `503 PROVIDER_NOT_READY`. Na última verificação, o agente da Contabo estava com `WHATSAPP_DRY_RUN=true` e `RPA_MODE=mock`. Serpro depende de contratação, credenciais e validação de cobertura. O fluxo Mac exige ambiente/certificado e homologação. Veja os limites detalhados no contexto.

## Iniciar o sistema

Requisitos: Node.js 22, npm, PostgreSQL para autenticação (local ou desenvolvimento Neon).

```sh
git clone https://github.com/Hoolydev/fs-sistema-e-agente.git
cd fs-sistema-e-agente/sistema-fs
npm ci
cp .env.example .env.local
```

Preencha `.env.local` com o banco de desenvolvimento e um `BETTER_AUTH_SECRET` aleatório. Depois:

```sh
node --env-file=.env.local --import tsx scripts/setup-auth.ts
mkdir -p .local
FS_PROVISION_EMAIL=admin@example.test FS_PROVISION_NAME='Administrador local' node --env-file=.env.local --import tsx scripts/provision-user.ts
npm run dev -- --port 3100
```

Abra http://localhost:3100. A senha inicial fica em `.local/ACESSO-SISTEMA.txt`; altere-a em Minha conta. Provisionar cria usuário: **não repetir contra produção para recuperar acesso**. O guia de migração explica como recuperar as configurações existentes.

## Testes

```sh
cd sistema-fs
npm run typecheck
npm run test:diagnostico
npm run test:comercial
npx tsx --test tests/documentos.test.ts
npm run build
```

```sh
cd automacao-ecac
corepack enable
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

Os testes de integração publicados precisam de credenciais privadas e têm efeitos distintos; leia `docs/OPERACAO.md` antes de executá-los. Não usar consultas fiscais ou WhatsApp real como teste de instalação.

## Publicação

Vercel: equipe `holy-devops`, projeto **`fs-solucoes-sistema`**, diretório raiz **`sistema-fs`**, Node 22. O repositório reúne múltiplos componentes: não publicar a raiz como aplicação Next.js nem publicar o agente na Vercel. A Contabo hospeda os processos contínuos do agente.

O push deste repositório é um backup de código/contexto. Não implica que a integração Git automática da Vercel foi conectada; a implantação existente usa a CLI. Confira as instruções antes de ligar deploy automático.

## Arquivos privados

Este repositório é público. **Não contém senhas, tokens, certificados, chaves SSH, banco de clientes, sessões do navegador nem pareceres reais.** O clone recupera código e documentação, não as credenciais nem os dados de produção. Consulte [o checklist de transferência privada](docs/NOVO-COMPUTADOR.md#itens-privados-que-nao-vem-no-clone).

O site institucional, em outro projeto, não é duplicado aqui; o contrato do webhook está documentado. Não alterar seu DNS ou sua publicação ao trabalhar no sistema.
