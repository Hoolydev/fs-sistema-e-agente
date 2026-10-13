# Instalar o conector em um novo Mac (contexto para o Claude desse Mac)

Escrito em 13/10/2026 no Mac de desenvolvimento. A memória do Claude não passa de um Mac para outro; este arquivo é o contexto.

## O que é

- **Sistema FS** (`sistema-fs`, Vercel, app.fssolucoestributarias.com.br): cadastro, Controller e pareceres fiscais.
- **Agente** (`automacao-ecac`, VPS 185.202.239.146): recebe o WhatsApp (Evolution API no próprio servidor, chip dedicado),
  identifica quem escreve pelo cadastro da equipe no sistema e mantém a **fila do Mac**.
- **Conector do Mac** (esta pasta): roda no Mac com o certificado digital da FS. Busca pedidos na fila do agente,
  entra no e-CAC/Regularize pelo Chrome real (sem captcha), coleta os relatórios, gera o parecer com o Claude Code
  (`claude -p`) e devolve o resultado ao agente, que arquiva no sistema e responde no WhatsApp.
- Pedidos de análise pelo WhatsApp (Fernando e Silfarney Oliveira) vão para este Mac. Se ficarem mais de 2 horas parados,
  o agente oferece o Serpro (cobrado) e só usa se a pessoa responder SIM.

Este Mac **não** administra a VPS, a Vercel nem o WhatsApp. Isso é feito no Mac de desenvolvimento.

## Regras

- Nada de senha, token, certificado, PDF de cliente ou conteúdo de `secrets/` no Git, no chat ou em logs.
- Não rodar análise de empresa real só para testar. O teste ponta a ponta é combinado com o Mac de desenvolvimento.
- Ler `AGENTS.md`, `CLAUDE.md` e `docs/CONTEXTO-ATUAL.md` na raiz do repositório antes de mudar código.
- Mudanças de código voltam por commit na branch `feat/diagnostico-preliminar`.

## Passos

1. **Pré-requisitos:** Node 22 ou mais novo, Google Chrome em `/Applications`, Python 3, Git e o Claude Code com login
   feito (o comando `claude -p "teste"` precisa responder sem pedir nada).
2. **Código:**
   ```sh
   git clone https://github.com/Hoolydev/fs-sistema-e-agente.git
   cd fs-sistema-e-agente && git checkout feat/diagnostico-preliminar
   cd conector-mac/pipeline && npm ci
   ```
3. **Certificado:** o certificado A1 da FS (CNPJ 47.733.961/0001-79) instalado no Chaveiro deste usuário do macOS.
   O Chrome usa o Chaveiro para escolher o certificado no gov.br.
4. **Pasta `conector-mac/secrets`** (permissão 700, arquivos 600), fora do Git:
   - `bridge.env`: copiar em privado do Mac de desenvolvimento (`.local/conector-mac/bridge.env`).
     Contém `BRIDGE_URL=https://api.fssolucoestributarias.com.br` e `BRIDGE_TOKEN`. Não precisa de túnel SSH.
   - `pipeline.env`: `FS_CERT_CNPJ=47733961000179` e `FS_CERT_RAZAO=` com a razão social da FS.
   - `empresas.json`: lista `[{ "cnpj": "...", "razao": "..." }]` das empresas que podem ser analisadas por este Mac
     (as que deram procuração à FS). O titular do certificado sempre entra. Copiar do Mac antigo, se existir.
   - `local-token`: gerar com `openssl rand -hex 32 > secrets/local-token`.
5. **Rodar** a partir de `conector-mac`:
   ```sh
   node agent/connector.mjs
   ```
   O log deve mostrar `"status":"ready"` com `"bridge":true`. Conferir com `curl -s http://127.0.0.1:18765/health`.
   Portas locais 18765 (API) e 19222 (Chrome). Não expor na internet.
6. **Deixar disponível:** Mac ligado, sessão gráfica aberta e sem dormir (por exemplo `caffeinate -dimsu` em outro terminal).
   Inicialização automática por LaunchAgent fica para depois da homologação.
7. **Avisar o Mac de desenvolvimento** que o conector está rodando, para conferir no agente se ele busca pedidos e
   combinar a análise de teste pelo WhatsApp.

## Se algo falhar

- `bridge.env ausente` ou 401 na fila: arquivo `bridge.env` errado ou incompleto.
- Captcha ou bloqueio no e-CAC: o conector não insiste e devolve o pedido; avisar o Mac de desenvolvimento.
- Detalhes de login e Chrome em `agent/browser.mjs`; visão geral em `README.md` desta pasta.
