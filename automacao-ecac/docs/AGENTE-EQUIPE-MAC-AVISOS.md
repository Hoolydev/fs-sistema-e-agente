# Agente WhatsApp: equipe, comprovantes, Mac e avisos

Implementado em 30/09/2026 (código), ainda não implantado na VPS. Decisões de Fernando/Oliveira: atribuições pessoa a pessoa cadastradas no sistema; comprovantes só arquivados na empresa; análises pelo WhatsApp sempre pelo Mac, com Serpro de reserva após 2 h e aviso de cobrança; resumo diário das contagens às 08:00 aos revisores.

## O que muda

- **Identidade pelo sistema.** O agente pergunta `GET /api/agent/team` quem é o número (nome, perfil, atribuições). Número sem cadastro é recusado. `AUTHORIZED_PHONE_NUMBERS` continua só como transição (pode pedir análise e consultar o acervo).
- **Comprovantes** (atribuição `comprovantes`): foto ou PDF pela Z-API é baixado (HTTPS, até 3 MB, tipo pelo conteúdo), a empresa é identificada pela legenda (CNPJ ou nome do Controller) ou perguntada, e o arquivo entra no acervo como `comprovante`. O sistema avisa os revisores.
- **Análises** (atribuição `analises`): confirmação SIM/NÃO e pedido na **fila do Mac do próprio agente** (Redis), com id derivado da mensagem (idempotente). O conector do Mac continua usando `/mac/claim`, `/mac/jobs/:id/status` e `/mac/jobs/:id/result`, agora no agente (`127.0.0.1:3000` pelo túnel SSH, bearer `MAC_BRIDGE_TOKEN`). Etapas avisam o solicitante uma vez; o parecer é arquivado no sistema antes da entrega e os revisores com `avisos` são informados.
- **Reserva Serpro**: pedido pendente há mais de `MAC_FALLBACK_AFTER_MS` recebe oferta; SIM cancela o pedido do Mac e publica no worker Serpro; NÃO mantém na fila.
- **Avisos**: a cada `NOTIFICATIONS_POLL_MS` o agente lê `GET /api/agent/notifications` e envia; confirma em `POST /api/agent/notifications/:id`.
- **Webhook**: o agente aceita `/webhooks/zapi/:token` e também `/zapi/:token` (endereço atual da ponte), com o mesmo `ZAPI_WEBHOOK_TOKEN`.

## Implantação na VPS (ordem)

1. Renovar a assinatura da instância Z-API (em 30/09 respondia "subscribe to this instance again").
2. No sistema (já no ar): administrador cadastra WhatsApp e atribuições em Configurações → Equipe.
3. No `.env` do agente: `MAC_BRIDGE_TOKEN` (novo valor; copiar para `secrets/bridge.env` do Mac como `BRIDGE_TOKEN`), `ZAPI_WEBHOOK_TOKEN` igual ao `WEBHOOK_TOKEN` da ponte, `FS_SYSTEM_URL=https://app.fssolucoestributarias.com.br`. Manter `WHATSAPP_DRY_RUN=true` até o teste.
4. `docker compose -f docker-compose.prod.yml -f docker-compose.cert.yml -f docker-compose.webhook.yml up -d --build api worker`.
5. Parar a ponte (`docker stop fs-mac-bridge`) só depois de o agente responder em `https://api.fssolucoestributarias.com.br/zapi/<token>`; o pedido `inflight` antigo da ponte (16/09) não migra.
6. No Mac: `secrets/bridge.env` com `BRIDGE_URL=http://127.0.0.1:3000` (túnel SSH para a VPS) e o novo token; reiniciar o conector.
7. Teste com `WHATSAPP_DRY_RUN=true` (mensagens só no log), depois `false` com os números cadastrados.

## Verificação

`pnpm test` (69 testes: atribuições, comprovantes, fila e endpoints do Mac, reserva Serpro, caixa de avisos), `pnpm build`. Na VPS: `/health`, `/ready`, logs de `api` e `worker`, `GET /api/agent/notifications` vazio após um ciclo.
