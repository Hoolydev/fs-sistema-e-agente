# Site → Comercial FS

O receptor implementado é `POST /api/webhooks/diagnostico`, no projeto Vercel existente `holy-devops/fs-solucoes-sistema`.

## Variáveis do site (fs-site-preview)

```
DIAGNOSTIC_WEBHOOK_URL=https://fs-solucoes-sistema.vercel.app/api/webhooks/diagnostico
DIAGNOSTIC_PIPELINE_ID=comercial
DIAGNOSTIC_STAGE_ID=novos-contatos
DIAGNOSTIC_WEBHOOK_TOKEN=<mesmo valor de FS_DIAGNOSTIC_WEBHOOK_TOKEN no sistema>
DIAGNOSTIC_WEBHOOK_SECRET=<mesmo valor de FS_DIAGNOSTIC_WEBHOOK_SECRET no sistema>
```

Usar somente no servidor, ambiente Production. O site deve ser reimplantado após a configuração. Não enviar visitantes diretamente ao Comercial: o site recebe o formulário e faz o POST servidor a servidor; o acesso ao Comercial é da equipe.

## Variáveis do sistema

- `FS_CRM_DATABASE_URL`: conexão PostgreSQL persistente, ou `DATABASE_URL` injetada pelo Neon.
- `FS_DIAGNOSTIC_WEBHOOK_TOKEN`: segredo Bearer obrigatório.
- `FS_DIAGNOSTIC_WEBHOOK_SECRET`: segredo de assinatura HMAC; quando configurado, assinatura é obrigatória.
- O acesso HTTP Basic ao Comercial foi removido por solicitação explícita do usuário. `FS_CRM_USER` e `FS_CRM_PASSWORD` não são mais utilizados. Contatos e PDFs exigem a sessão do login próprio Better Auth. O webhook continua exigindo seus segredos.

## Comportamento

Valida o contrato 1.0 fornecido pelo site, CNPJ, consentimento para atendimento, headers e a assinatura do corpo original. Timestamp aceita diferença máxima de cinco minutos. `event_id` é único no banco: reenvio idêntico retorna 200 com o mesmo contato; conteúdo alterado sob a mesma chave retorna 409. Datas de envio e consentimento podem mudar entre tentativas, conforme o contrato. Funil/etapa nulos são aceitos como padrão; IDs não reconhecidos retornam 422.

201 confirma que o registro foi salvo. Falha de armazenamento retorna 503. Nada é confirmado antes da persistência. Uma nova solicitação com novo UUID pode gerar outro contato para o mesmo CNPJ — não há fusão silenciosa de solicitações distintas.

Em `/comercial`, o contato aparece em Novos contatos. O modal possui Dados do contato, Diagnóstico e Anexos. O parecer pode ser anexado em PDF e visualizado no modal, baixado ou aberto para impressão. PDFs de apoio ficam na aba Anexos. Limite de 3 MB por documento; arquivos ficam no PostgreSQL e exigem autenticação. Uploads exigem mesma origem e validação de cabeçalho PDF. A equipe deve conferir o CNPJ do arquivo: anexar não implica validação automática do conteúdo fiscal.

Consultas ao Serpro e geração automática de pareceres reais continuam pendentes. Um lead novo não recebe os dados de exemplo do módulo Diagnóstico fiscal. Consentimento para contato não substitui procuração.

Localmente, o armazenamento usa `.local/comercial/crm.sqlite`, ignorado pelo Git e Vercel. Produção recusa armazenamento local; exige PostgreSQL. Não migrar a base de homologação como dados de clientes. A tela atual lista as 500 solicitações mais recentes e atualiza a cada 30 segundos ou pelo botão Atualizar.

## Testes

- `npm run test:comercial`: persistência, deduplicação, conflito de conteúdo, assinatura, CNPJ, destino, falha de banco, etapa e vínculo dos arquivos.
- `node scripts/test-site-webhook.mjs '/caminho/site/api/diagnostic.js'`: usa o handler real do site, envia só a localhost e cria um contato fictício identificado. Nunca abre WhatsApp.
- `npm run build`: valida o projeto.

## Ativação em produção

Em 15/09/2026, banco Neon Free `fs-comercial` conectado ao projeto existente, variáveis de Production configuradas nos dois projetos e ambos reimplantados. URL acima validada em produção. Teste completo com o endpoint público do site, persistência PostgreSQL, reenvio, upload/download PDF e bloqueio anônimo concluído. O contato `HOMOLOGAÇÃO FS · Teste de integração` é fictício e foi mantido para conferência. Acesso inicial da equipe está no arquivo privado local `.local/ACESSO-COMERCIAL.txt` (não publicado).


Atualização: a proteção HTTP Basic descrita no histórico de ativação foi removida a pedido do usuário. Acesso atual usa Better Auth; ver LOGIN-PWA-AGENTE.md. O antigo arquivo de acesso Basic não é usado.
