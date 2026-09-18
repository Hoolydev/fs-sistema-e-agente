# Diagnóstico preliminar pelo botão "Analisar CNPJ" — 17/09/2026

## Por que existe

A tentativa de consultar o CNPJ 04.907.399/0001-40 (lead comercial) em 17/09/2026 retornou, do Serpro Integra Contador:

> `[AcessoNegado-ICGERENCIADOR-022]` — o autor do pedido (FS, 47.733.961/0001-79) não tem procuração autorizada no Portal e-CAC para o contribuinte.

Autenticação, certificado e contrato estavam corretos. **O SITFIS só é liberado para terceiros com procuração eletrônica no e-CAC** — a consulta de 16/09 (51.646.813/0001-94) funcionou porque aquele cliente tinha procuração. Isso é regra da Receita, não do código, e não tem contorno técnico.

A consulta à PGFN (Serpro Consulta Dívida Ativa) **não exige procuração nem certificado**. Para o mesmo CNPJ retornou `404 {"message":"CNPJ não encontrado."}`, que nesta API indica ausência de inscrição em dívida ativa — resultado válido, não erro.

## O que o botão faz agora

`POST /api/diagnosticos` (sessão obrigatória) executa, direto na Vercel:

1. Valida o CNPJ. Se já existe parecer emitido pelo aplicativo para o CNPJ dentro de `FS_DIAGNOSTIC_REUSE_HOURS` (padrão 24 h), **reabre o arquivado sem nova consulta** (HTTP 200, `reused: true`).
2. Em paralelo: cadastro público do CNPJ (dados abertos RFB via BrasilAPI, não cobrado, não bloqueante) e **uma** consulta PGFN (`lib/diagnostico/pgfn.ts`), com a resposta bruta preservada.
3. Monta o `DiagnosticReport` preliminar (`lib/diagnostico/preliminar.ts`): fonte `pgfn` = coletado, fonte `rfb` = **pendente** com a instrução de procuração, fonte `cadastro` = coletado/pendente. Só inscrições `ATIVA EM COBRANCA` entram no total; outras situações (ajuizada, parcelada etc.) e extintas vão para quadros complementares sem somar.
4. Arquiva pelo gerador canônico (`archiveCanonicalReport` → mesmo template FS, PDF imutável) e grava a evidência PGFN em `fs_diagnostic_evidence` (document_id, http_status, sha256, conteúdo bruto). O hash consta na nota da fonte do parecer.
5. Retorna `{ id, reportUrl, pdfUrl, version, reused, rfbPending: true }`; a tela navega para `/diagnostico/doc_…`, que exibe o banner "Receita Federal pendente".

Totais: `summarize()` retorna `rfb = null` e `total = null` enquanto a RFB estiver pendente — a tela e o PDF mostram "Não informado", nunca zero.

## Respostas de erro

| Código | HTTP | Situação |
| --- | --- | --- |
| `INVALID_CNPJ` | 422 | dígitos verificadores inválidos |
| `PROVIDER_NOT_READY` | 503 | `SERPRO_DIVIDA_CONSUMER_KEY/SECRET` ausentes; nada consultado |
| `PROVIDER_DENIED` | 502 | Serpro recusou credenciais/acesso ao serviço Dívida Ativa |
| `PROVIDER_ERROR` | 502 | rede, prazo, 404 sem "não encontrado", estrutura inesperada, contribuinte divergente |
| `ISSUANCE_FAILED` | 500 | consulta concluída, mas validação/arquivamento falhou. **Não repetir automaticamente**: a consulta já foi feita e não há parecer para reaproveitar |

## Configuração (Vercel → projeto `fs-solucoes-sistema`)

| Variável | Origem |
| --- | --- |
| `SERPRO_DIVIDA_CONSUMER_KEY` / `SERPRO_DIVIDA_CONSUMER_SECRET` | VPS Contabo: `/opt/fs-automacao-ecac/secrets/serpro-divida-ativa/consumer-key` e `consumer-secret` |
| `FS_PROCURADOR_CNPJ` | opcional; padrão `47733961000179` |
| `FS_DIAGNOSTIC_REUSE_HOURS` | opcional; padrão 24 |
| `FS_CADASTRO_PROVIDER_URL` | opcional |

Sem as credenciais o botão responde 503 explicando exatamente o que falta; não há mais o aviso genérico de homologação.

## Próxima etapa: versão completa (RFB)

Quando o lead outorgar a procuração eletrônica no e-CAC para a FS (serviço de Situação Fiscal), a análise completa segue o fluxo já homologado no worker da VPS (`homologate-serpro-sitfis.mjs` + `prepare-serpro-report.ts` + `POST /api/agent/reports`), gerando a **versão seguinte** para o mesmo CNPJ. A integração do SITFIS ao botão (job na VPS, status "aguardando procuração", reprocessar) continua pendente e está descrita em `VERIFICACAO-CONSULTA-2026-09-17.md`.

## Testes

`npx tsx --test sistema-fs/tests/preliminar.test.ts` — construtor, cliente PGFN (200 / 404 / 403 / divergência), fluxo completo com reaproveitamento e evidência, PDF pelo template. Nenhum teste chama serviço externo.
