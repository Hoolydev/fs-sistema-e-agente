# WhatsApp do agente pela Evolution API (13/10/2026)

A Z-API (assinatura vencida em 30/09/2026) foi substituída pela Evolution API v2.3.7, gratuita e open source,
instalada na própria VPS em um projeto separado: `/opt/fs-evolution` (arquivos em `deploy/evolution/`).

- Contêineres `fs-evolution-api-1`, `fs-evolution-postgres-1`, `fs-evolution-redis-1`, com limites de memória (1 GB, 512 MB, 128 MB).
- Sem rota pública. A API escuta só em `127.0.0.1:8095` e na rede interna `fs-automacao-ecac_backend`.
- Instância `fs-agente`, conexão WhatsApp Web (Baileys) com chip dedicado ao agente. Grupos ignorados e ligações recusadas com aviso.
- Webhook: `http://fs-automacao-ecac-api-1:3000/webhooks/evolution/<EVOLUTION_WEBHOOK_TOKEN>`, eventos `MESSAGES_UPSERT` e `CONNECTION_UPDATE`.
- Agente: `WHATSAPP_PROVIDER=evolution`, `EVOLUTION_BASE_URL`, `EVOLUTION_API_KEY` (= `AUTHENTICATION_API_KEY` da Evolution),
  `EVOLUTION_INSTANCE`, `EVOLUTION_WEBHOOK_TOKEN`. `WHATSAPP_DRY_RUN=true` até a homologação autorizada.
- Mídia recebida (comprovantes): o arquivo do WhatsApp é criptografado; o agente pede o conteúdo à Evolution
  (`chat/getBase64FromMediaMessage`) e aplica o mesmo limite de tamanho e conferência de tipo (PDF, JPG, PNG).
- Número de quem escreve: com o endereçamento LID o número real vem em `remoteJidAlt`/`senderPn`. Celular brasileiro
  antigo sem o nono dígito é completado para bater com o cadastro da equipe.

## Conectar ou reconectar o chip

No Mac, rode `.local/whatsapp-qr.sh` (fora do Git) e escaneie em até 20 segundos no celular do chip:
WhatsApp > Dispositivos conectados > Conectar dispositivo. Se o QR expirar, rode de novo.
Queda de sessão aparece no log do agente como `evolution whatsapp session disconnected`.

## Riscos

Conexão não oficial (WhatsApp Web). O WhatsApp pode bloquear o número; usar só o chip dedicado e volume baixo.
A alternativa sem esse risco é a API oficial da Meta, já suportada (`WHATSAPP_PROVIDER=meta`).
