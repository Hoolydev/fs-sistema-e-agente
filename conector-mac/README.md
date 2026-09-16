# Conector Mac e ponte VPS — código preservado

Esta pasta contém a cópia versionável dos arquivos adicionais encontrados em `conector-local/` em 16/09/2026. A instalação antiga foi preservada. Não inclui certificados, credenciais, sessões, empresas reais, jobs ou saídas. Exemplos com identificadores de cliente foram substituídos por dados demonstrativos.

- `agent/connector.mjs`: serviço Node local, pedidos e pull da ponte, autorização de empresas, chamada do pipeline.
- `agent/browser.mjs`: Chrome local e CDP loopback, login e troca de perfil.
- `pipeline/src/`: coleta, extração, parecer e ferramentas de inspeção.
- `pipeline/skills/`: referências fornecidas/adaptadas para o pipeline; tratar como material do produto.
- `vps-bridge/bridge.mjs`: ponte HTTP com fila em arquivo, callback Z-API e recuperação pelo Mac.

Este é um caminho diferente do worker central em `automacao-ecac`. A integração com o acervo foi implementada no worker central; não assumir que a ponte Mac já a utiliza. Confirmar callback e reconciliar os dois caminhos antes de ativar mensagens reais.

## Preparar dependências

```sh
cd conector-mac/pipeline
npm ci
```

O pipeline requer Chrome/Playwright, Python 3 para os cálculos e Claude Code autenticado para redação. Não autenticar o Claude com a chave OpenAI. A sessão gráfica macOS precisa estar ativa e o computador acordado.

## Instalação de desenvolvimento

Use esta pasta como home somente em uma cópia privada/local de trabalho, mantendo estado ignorado. Antes de iniciar, crie `secrets/` com permissão 700 e recupere em privado `pipeline.env`, `bridge.env`, `empresas.json` e `local-token`. Não copiar valores para este README. `pipeline.env` contém a configuração do certificado/fluxo; `bridge.env` contém `BRIDGE_URL` e `BRIDGE_TOKEN`. Sem ponte configurada, o pull não roda.

```sh
# Na pasta conector-mac, depois de configurar os arquivos privados:
node agent/connector.mjs
```

Portas padrão: API `127.0.0.1:18765` (token local), Chrome/CDP `127.0.0.1:19222`. Não expor na internet. Não iniciar junto com o serviço antigo que usa as mesmas portas. O diretório `FS_CONNECTOR_HOME` precisa conter `agent/`, `pipeline/` e `secrets/`; usar caminhos coerentes para o usuário novo.

A instalação via LaunchAgent do protótipo TypeScript em `automacao-ecac/scripts/mac/install.py` é anterior e não instala automaticamente esta variante. Para inicialização automática, revisar o plist para este entrypoint após homologação. Não reutilizar symlinks `node_modules` ou caminhos absolutos do Mac antigo.

## Ponte (VPS)

Copie `.env.example` para `.env`, configure os segredos e mantenha `WHATSAPP_DRY_RUN=true`. Depois:

```sh
node --env-file=.env vps-bridge/bridge.mjs
```

A configuração acima usa loopback e estado local. Publicação HTTPS/reverse proxy, volumes e callback devem ser inspecionados no serviço existente `/opt/fs-mac-bridge`; não substituir o serviço ou seu estado com uma instância vazia. O token da ponte e a allowlist são obrigatórios para operações protegidas.

## Limites

Sintaxe e dependências podem ser validadas sem consulta. Homologação de certificado, sessão, perfil, PDFs corretos e entrega deve ser feita separadamente com dados autorizados. Notas históricas de login não substituem prova ponta a ponta no novo computador.
