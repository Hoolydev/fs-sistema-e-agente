# Ambientes e operação

## Sistema Vercel

- Equipe `holy-devops`; projeto `fs-solucoes-sistema`; Root Directory: `sistema-fs` ao vincular este monorepo.
- Framework Next.js, Node 22, `npm ci`, `npm run build`.
- Principal: https://app.fssolucoestributarias.com.br
- Alias anterior mantido: https://fs-solucoes-sistema.vercel.app
- `BETTER_AUTH_URL=https://app.fssolucoestributarias.com.br`
- `BETTER_AUTH_TRUSTED_ORIGINS=https://app.fssolucoestributarias.com.br,https://fs-solucoes-sistema.vercel.app`

O DNS do domínio está na Vercel. O subdomínio `app` foi vinculado ao projeto e validado com HTTPS. O root/www pertence ao site `fs-site-preview`; `api`/`coolify` atendem a VPS. Não redirecionar indiscriminadamente o alias antigo: callbacks servidor a servidor podem perder o header Authorization em redirecionamentos.

Publicação manual, quando autorizada:

```sh
cd sistema-fs
npx vercel link --project fs-solucoes-sistema --scope holy-devops
npm run typecheck
npm run test:diagnostico
npm run test:comercial
npx tsx --test tests/documentos.test.ts
npm run build
npx vercel deploy --prod
```

O push GitHub não conectou automaticamente o projeto Vercel a este repositório. Caso habilite CI/CD, selecionar **Root Directory `sistema-fs`** e preservar as variáveis existentes. Não criar um projeto duplicado nem trocar o site institucional.

## Persistência

Neon/PostgreSQL compartilhado nesta fase: `DATABASE_URL`; overrides `FS_AUTH_DATABASE_URL`, `FS_CRM_DATABASE_URL`. As migrações de autenticação são explícitas. Backups devem usar ferramentas do banco; não fazer commit de dumps. O repositório não contém os PDFs ou usuários existentes.

## Contabo

Instalação existente em `/opt/fs-automacao-ecac`. A API escuta internamente na porta 3000; Redis/BullMQ/worker ficam em Docker. O Coolify e outros serviços já existem e devem ser preservados. Host e acesso SSH são informações operacionais a recuperar em privado.

Último conjunto Compose observado: **`docker-compose.prod.yml` + `docker-compose.cert.yml`**. Não subir somente o primeiro sem inspecionar mounts/overrides: isso pode remover a configuração do certificado/navegador.

```sh
cd /opt/fs-automacao-ecac
docker compose -f docker-compose.prod.yml -f docker-compose.cert.yml ps
curl -fsS http://127.0.0.1:3000/health
```

Há ainda o serviço `fs-mac-bridge` em `/opt/fs-mac-bridge`. Sua fonte local está preservada em `conector-mac/vps-bridge/`. Inspecionar configurações/callbacks antes de escolher qual componente recebe mensagens reais. O novo snapshot de código não foi reimplantado na VPS durante a preparação do GitHub.

Integração acervo: no agente, `FS_SYSTEM_API_TOKEN` corresponde ao `FS_AGENT_SERVICE_TOKEN` do sistema. `FS_SYSTEM_URL` ainda usava o alias Vercel anterior na última inspeção; ele permanece compatível. `AUTHORIZED_PHONE_NUMBERS` e `FS_AGENT_ALLOWED_PHONES` devem concordar. Não habilitar números arbitrários.

O arquivo `.env.example` não é configuração de produção. Segredos OpenAI/Serpro/certificado ficam em arquivos montados restritos. Não executar `docker compose down -v` nem limpar estado para corrigir configuração.

## Scripts de validação e efeitos

| Comando | Efeito |
| --- | --- |
| Testes unitários | Dados sintéticos e stores temporários; não consulta Receita/PGFN |
| `scripts/setup-auth.ts` | Cria/altera tabelas de autenticação no banco configurado |
| `scripts/provision-user.ts` | Cria usuário e grava senha inicial privada; não é reset de senha |
| `scripts/verify-access.mjs URL` | Login/logout e consultas autenticadas; lê `.local/provisioned-user.json` + `.env.production.local`; requer fixture já existente |
| `scripts/verify-production.mjs` | Cria lead/anexo fictício; não executar como simples healthcheck |
| `scripts/test-site-webhook.mjs` | Exercita handler do site contra localhost; precisa fonte do site separada |
| `pnpm demo` | Simulação local; conferir configuração antes de rodar |

Não há teste automático que comprove uma consulta fiscal real ponta a ponta no novo computador. O limite de logs deve evitar cookies, corpo de documentos e segredos. Confirme resposta/status sem imprimir credenciais.
