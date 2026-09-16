# Continuar em outro computador

## Requisitos

- Git, Node.js **22** (incluindo `node:sqlite`, usado no CRM local), npm e pnpm **10.33.0** para o agente.
- Docker opcional para PostgreSQL/Redis locais.
- Conta GitHub com acesso ao repositório; conta Vercel na equipe `holy-devops` para configurações/publicação.
- Mac com Chrome, Python 3, certificado e Claude autenticado somente se for retomar a coleta local. O sistema web não precisa do certificado instalado no computador do desenvolvedor.

## Clone e banco de desenvolvimento

```sh
git clone https://github.com/Hoolydev/fs-sistema-e-agente.git
cd fs-sistema-e-agente
```

Uma opção de banco local usa os serviços existentes do agente (credenciais **apenas de desenvolvimento**, portas em loopback):

```sh
cd automacao-ecac
cp .env.example .env
docker compose up -d postgres redis
cd ../sistema-fs
npm ci
cp .env.example .env.local
```

O modelo aponta para `postgres://ecac:ecac@localhost:5432/ecac`. Você pode usar um banco Neon de desenvolvimento em seu lugar. Preencha um `BETTER_AUTH_SECRET` gerado com `openssl rand -hex 32` e mantenha `BETTER_AUTH_URL=http://localhost:3100`. Não colocar segredos em `NEXT_PUBLIC_*`.

```sh
node --env-file=.env.local --import tsx scripts/setup-auth.ts
mkdir -p .local
FS_PROVISION_EMAIL=admin@example.test FS_PROVISION_NAME='Administrador local' node --env-file=.env.local --import tsx scripts/provision-user.ts
npm run dev -- --port 3100
```

O script gera a senha em arquivo privado. Não recriar contas de produção. As tabelas do Comercial/acervo são inicializadas pelo store ao serem usadas; tabelas de autenticação são preparadas pelo script. Com `DATABASE_URL` preenchida, o CRM também usa PostgreSQL. SQLite é fallback local do CRM, não substitui PostgreSQL de autenticação.

## Recuperar configuração Vercel existente

Somente se precisar trabalhar com os ambientes já configurados:

```sh
cd sistema-fs
npx vercel login
npx vercel link --project fs-solucoes-sistema --scope holy-devops
npx vercel env pull .env.production.local --environment production
```

Esse arquivo tem **segredos reais** e está ignorado pelo Git. Não usá-lo para desenvolvimento ou migrações experimentais. Use um banco isolado e os exemplos para localhost. O banco de produção continua no Neon; não é necessário copiar PDFs de clientes para subir a interface.

## Agente central

```sh
cd automacao-ecac
corepack enable
corepack prepare pnpm@10.33.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env
pnpm typecheck
pnpm test
pnpm build
```

O carregamento das variáveis precisa ser explícito fora do Docker (o Node não lê `.env` sozinho):

```sh
node --env-file=.env --import tsx src/db/migrate.ts
node --env-file=.env --import tsx src/server.ts
# Em outro terminal:
node --env-file=.env --import tsx src/worker.ts
```

Mantenha `WHATSAPP_DRY_RUN=true`, `RPA_MODE=mock`, `SERPRO_ENABLED=false` e `LLM_PROVIDER=disabled` nos testes iniciais. Preencher a integração real só depois de validar o caminho e as autorizações. Ver `conector-mac/README.md` para a alternativa local.

## Itens privados que nao vem no clone

Antes de apagar ou entregar o Mac antigo, transfira por canal privado/cofre, se precisar deles:

| Item | Origem no computador antigo / alternativa |
| --- | --- |
| Variáveis do sistema | `sistema-fs/.env.local`, `.env.production.local`; produção recuperável pela Vercel |
| Acesso inicial/admin | `sistema-fs/.local/ACESSO-SISTEMA.txt`; senha pode ter sido alterada após geração |
| Chave SSH Contabo | Chave privada do operador em `~/.ssh/`; ou cadastrar nova chave na VPS por acesso autorizado |
| Configuração do agente | `automacao-ecac/.env`, `deploy.env`, `secrets/`; conferir arquivos ativos da VPS |
| Certificado e senha | `materiais-cliente/` e `conector-local/secrets/`; transferir separadamente, nunca versionar |
| Configuração do conector | `conector-local/secrets/` (vault, token local, ponte, empresas autorizadas) |
| Materiais originais | `materiais-cliente/`, especialmente PDF modelo e arquivos originais da FS |
| Relatórios/contratos privados | `output/`; não estão no repositório público |
| Coletas/estado local | `conector-local/jobs/`, logs e pipeline de execução, se necessários para continuidade de tarefas |
| Site institucional | Projeto separado em `Documents/FS site/site`; preservar seu repositório/backup separadamente |

Não reutilizar automaticamente o perfil Chrome do Mac anterior. Reinstalar certificado com chave privada no Chaveiro do novo usuário e validar a seleção pelo Chrome. O PFX fornecido anteriormente é da empresa (e-CNPJ), não e-CPF; portais que exigem e-CPF não o aceitarão por simples reinstalação. A aceitação real precisa ser testada no serviço correspondente.

LaunchAgents, atalhos, caminhos absolutos, sessões macOS/Claude, tokens de login Vercel e dependências `node_modules` não migram pelo Git. Recriar no computador novo conforme o caminho efetivo. A antiga instalação usava `~/Documents/ChatGPT/FS Soluções Tributarias/conector-local` e atalhos `~/.local/bin/fs-conector`; não copiar um plist apontando para um diretório inexistente.

## Conferência final

- Login local e rota Diagnóstico carregam; PDF demonstrativo abre após autenticação.
- Testes do sistema e agente passam.
- `.env*` reais, certificados e arquivos privados aparecem como ignorados em `git status --ignored`.
- Não houve nova consulta fiscal, envio WhatsApp ou migração de produção como efeito da instalação.
