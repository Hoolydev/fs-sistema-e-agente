# Automação FS WhatsApp e e-CAC

**Estado atualizado em 16/09/2026:** ver [contexto consolidado](../docs/CONTEXTO-ATUAL.md). O agente central integra o acervo do sistema, mas envio real e coleta fiscal precisam de homologação. Última configuração observada: `WHATSAPP_DRY_RUN=true`, `RPA_MODE=mock`, Serpro não ativado. O conector adicional e a ponte estão em [conector-mac](../conector-mac/README.md).

## O que já está implementado

- recebimento de mensagens pela Meta Cloud API ou pela Z-API, selecionável por configuração;
- validação HMAC da assinatura `x-hub-signature-256`;
- extração de mensagens de texto do WhatsApp;
- autorização inicial por lista de telefones;
- interpretação determinística de CNPJ, competência e tipo de documento;
- confirmação explícita por `SIM` antes de criar o job;
- fila BullMQ com proteção contra jobs duplicados;
- worker selecionável entre RPA e API oficial Serpro, com ativação separada;
- clientes para enviar texto e documento pela Meta Cloud API ou Z-API;
- adaptador OpenAI Responses API com saída JSON estrita para a análise fiscal;
- armazenamento local e adaptador S3 privado;
- criptografia AES-256-GCM dos documentos antes do envio ao armazenamento S3;
- esquema PostgreSQL para contatos, empresas, solicitações, jobs, documentos e auditoria;
- adaptador Playwright com certificado PFX/P12 preparado para a prova técnica;
- fluxo de login Gov.br por certificado e troca para Procurador de Pessoa Jurídica por CNPJ;
- adaptador SITFIS via Serpro e fluxos RPA de Situação Fiscal/PGFN ainda sem homologação completa;
- geração do Diagnóstico Fiscal Federal em PDF no padrão visual da FS;
- Dockerfile, Compose local e Compose de produção para a VPS.

## Ambiente da Contabo

O MVP está instalado em `/opt/fs-automacao-ecac` e é iniciado pelo Docker com
`docker-compose.prod.yml` com `docker-compose.cert.yml` na última inspeção. O override Serpro é uma alternativa ainda não ativada.
Durante a homologação, a API responde apenas em `127.0.0.1:3000`, o WhatsApp permanece em
`dry-run` e o Serpro aguarda ativação. Os contêineres de longa duração reiniciam
automaticamente com o servidor.

Comandos operacionais, executados na VPS:

```bash
cd /opt/fs-automacao-ecac
docker compose -f docker-compose.prod.yml ps
curl -fsS http://127.0.0.1:3000/health
curl -fsS http://127.0.0.1:3000/ready
docker compose -f docker-compose.prod.yml logs -f api worker
```

## Limite atual

O fluxo real está implementado e o certificado A1 foi validado na VPS. O e-CAC
apresentou um desafio hCaptcha tanto no Chrome da VPS quanto no Chrome local
controlado pela automação. A coleta não está homologada; resolver um desafio não garante aceitação da sessão. A automação deve parar quando houver bloqueio. Depois do login, o worker valida
o perfil de procurador e o CNPJ antes de acessar qualquer documento.

## Execução local sem Docker

```bash
cp .env.example .env
pnpm install
pnpm test
pnpm typecheck
pnpm demo
```

O servidor e o worker precisam de Redis. PostgreSQL é necessário para executar as migrações e será usado na próxima etapa para persistir o estado das conversas.

O fluxo ampliado de coleta, análise por LLM, validação, geração do parecer e
correções pelo WhatsApp está descrito em `ARQUITETURA_DIAGNOSTICO_FISCAL.md`.

```bash
pnpm migrate
pnpm dev
pnpm dev:worker
```

## Integração com WhatsApp

Defina `WHATSAPP_PROVIDER=meta` ou `WHATSAPP_PROVIDER=zapi`. O restante do
agente usa a interface interna `WhatsAppGateway`, então a fila, o RPA e a
geração do parecer não dependem do provedor escolhido.

### Meta Cloud API

Na Meta, configure:

- callback: `https://SEU_DOMINIO/webhooks/whatsapp`;
- verify token: o mesmo valor de `WHATSAPP_VERIFY_TOKEN`;
- assinatura: validada com `WHATSAPP_APP_SECRET`;
- assinatura de eventos: `messages`.

### Z-API

Preencha `ZAPI_INSTANCE_ID`, `ZAPI_INSTANCE_TOKEN` e `ZAPI_CLIENT_TOKEN`, gere
um `ZAPI_WEBHOOK_TOKEN` aleatório e configure na Z-API:

- recebimento: `https://SEU_DOMINIO/webhooks/zapi/SEU_ZAPI_WEBHOOK_TOKEN`;
- desconexão: `https://SEU_DOMINIO/webhooks/zapi/SEU_ZAPI_WEBHOOK_TOKEN/disconnected`.

As rotas da Z-API exigem HTTPS, conferem o token secreto da URL e rejeitam
callbacks de outra instância. O token não deve ser incluído em commits nem em
mensagens. Os logs dessas rotas ficam desativados para evitar registrar a URL.

O envio do parecer usa Base64, evitando publicar o PDF em uma URL aberta. O
callback ignora mensagens do próprio número, grupos, listas, canais e status.

O endpoint de saúde é `GET /health` e o de prontidão é `GET /ready`.

## Análise com OpenAI

O worker usa `LLM_PROVIDER=openai` e `LLM_MODEL=gpt-5.5`. A chave é lida de
`/run/secrets/openai_api_key`, montado somente no worker pelo Docker Compose.
Ela não fica no código, na imagem ou no `.env`.

A análise usa a Responses API com `store: false` e Structured Outputs. O modelo
recebe somente o JSON estruturado e trechos do dossiê identificados por fonte.
A resposta é validada por schema e pelo CNPJ antes de poder seguir para o PDF e
para a revisão humana.

Para testar a integração com dados sintéticos na VPS:

```bash
docker compose -f docker-compose.prod.yml run --rm worker node dist/scripts/validate-openai.js
```

## Formato inicial de mensagem

Exemplo reconhecido pelo parser:

```text
Preciso da situação fiscal do CNPJ 47.733.961/0001-79 referente a 08/2026

Faça uma análise da empresa 51.646.813/0001-94
```

Tipos reconhecidos: diagnóstico fiscal federal, situação fiscal, DCTFWeb e
caixa postal. O fluxo real implementado nesta fase é o diagnóstico fiscal com as
fontes Receita Federal e PGFN; os demais permanecem pendentes de homologação.

## Certificado

Somente para prova local, o adaptador aceita `CERT_PFX_PATH` e `CERT_PFX_PASSPHRASE`. Na VPS, esses valores deverão vir de um cofre de segredos. Arquivos de certificado estão bloqueados no `.gitignore` e `.dockerignore`.

Nunca envie certificado ou senha pelo WhatsApp, por commit ou por log.
