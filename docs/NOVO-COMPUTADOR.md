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

---

## Conector do WhatsApp (Mac + Ponte VPS) — instalação em máquina nova

Arquitetura: WhatsApp → Z-API → **ponte na VPS** (`vps-bridge/`, só loopback + rota pública `/zapi` via Traefik/Coolify) → **conector no Mac** (`conector-mac/`, puxa por túnel SSH de saída) → e-CAC/PGFN → **gerador oficial** (`sistema-fs`, comando `parecer:gerar`) → PDF de volta pelo WhatsApp. Nada do Mac é exposto na internet.

### 1. Mac (conector) — pré-requisitos
- Node 22+ (via Homebrew), Google Chrome, Python 3, `claude` CLI autenticado (`claude` abre e loga).
- Certificado A1 (PFX) da FS + senha, e a chave SSH da VPS.

### 2. Instalar o conector
```sh
# na raiz do clone
BASE="$HOME/fs-conector"                 # pasta de operação (fora do Git)
mkdir -p "$BASE"/{secrets,jobs,logs,browser}
cp -R conector-mac/agent conector-mac/pipeline "$BASE"/
cd "$BASE/pipeline" && npm install        # playwright, pdf-parse
# segredos (NÃO versionar): certificate.pfx, passphrase, pipeline.env, empresas.json, bridge.env, local-token
#  - pipeline.env: FS_CERT_CNPJ, FS_CERT_RAZAO, FS_ECAC_PROFILE=$BASE/browser
#  - empresas.json: [{"cnpj":"...","razao":"..."}]  (allowlist)
#  - bridge.env: BRIDGE_URL=http://127.0.0.1:18790  BRIDGE_TOKEN=<igual ao da VPS>
# importar o PFX no Chaveiro de login e autorizar o Chrome
```
LaunchAgents (usuário) — conector e túnel SSH de saída. Use caminhos ASCII nos `StandardOutPath` (ex.: `~/Library/Logs/…`); pasta com acento/espaço causa launchd EX_CONFIG 78:
```sh
# br.com.fs.conector.plist        -> node <BASE>/agent/connector.mjs  (env FS_CONNECTOR_HOME=<BASE>, FS_ECAC_CDP_PORT=19222)
# br.com.fs.conector.tunnel.plist -> ssh -N -o ServerAliveInterval=30 -i <chave> -L 18790:127.0.0.1:18790 root@<VPS>
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/br.com.fs.conector.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/br.com.fs.conector.tunnel.plist
fs-conector status   # atalho opcional em ~/.local/bin apontando p/ agent/connector.mjs
```

### 3. Gerador de parecer (oficial) — no mesmo clone
```sh
npm --prefix sistema-fs ci
npm --prefix sistema-fs run parecer:gerar -- --demo --output /tmp/Parecer_FS_DEMO.pdf   # teste
```
O conector emite pelo `pipeline/src/parecer-fs.mjs`, que monta o `DiagnosticReport` e chama `parecer:gerar` (template/logo/recibo oficiais). Aponte `FS_SISTEMA_DIR` para a raiz do clone se ele não estiver no caminho padrão. **Não** usar HTML livre. Ative a skill `parecer-fs` (`~/.claude/skills/parecer-fs/` para todas as sessões, ou `.claude/skills/` do projeto).

### 4. Ponte na VPS (`vps-bridge/`)
```sh
# na VPS, em /opt/fs-mac-bridge:
#  - bridge.mjs (deste repo) + bridge.env (MAC_BRIDGE_TOKEN, WEBHOOK_TOKEN, ZAPI_*, AUTHORIZED_PHONE_NUMBERS, WHATSAPP_DRY_RUN=false, BRIDGE_HOST=0.0.0.0, BRIDGE_STATE_DIR=/app/state)
bash deploy-api.sh    # sobe o container na rede do Coolify, expõe só /zapi com TLS e registra o webhook na Z-API (PUT)
```
DNS: subdomínio `api.<dominio>` → IP da VPS (registro A). Coolify/Traefik emite o TLS (CAA precisa liberar letsencrypt). Webhook Z-API (recebimento) = `https://api.<dominio>/zapi/<WEBHOOK_TOKEN>` via **PUT** em `update-webhook-received`.

### 5. Validação
1. `parecer:gerar --demo` gera PDF com logo/indicadores/Partes I–IV/recibo. 2. `fs-conector analisar <CNPJ>` roda coleta+emissão local. 3. Mensagem no WhatsApp (de número autorizado) → PDF de volta. Sessão do e-CAC exige login humano (possível captcha); o Mac precisa ligado, acordado e logado.
