# Emissão canônica de evidências Serpro

O PDF SITFIS é documento de apoio. A entrega final é um `DiagnosticReport` real, validado, exibido no sistema e renderizado por `lib/diagnostico/pdf.ts`. Não entregar o extrato como substituto do parecer FS.

## Sem nova consulta

`lib/diagnostico/serpro-evidence.ts` mapeia texto SITFIS e JSON Dívida Ativa já coletados. O mapeador aceita o layout homologado, verifica CNPJ, inscrições duplicadas, processos, composição RFB e conciliação SIDA/PGFN. Divergência ou linha desconhecida interrompe a emissão. Outros layouts exigem revisão/adaptação, nunca descarte silencioso.

O total em cobrança inclui RFB devedor e PGFN ativa. Registros da seção de exigibilidade suspensa/a vencer e inscrições extintas ficam em quadros complementares. Informações PGFN presentes no SITFIS não são somadas novamente. Componentes ausentes, CAPAG, modalidade e simulação ficam não informados; não assumir desconto zero ou benefício aprovado.

Preparação local (caminhos absolutos, dados fora do Git):

```sh
cd sistema-fs
npx tsx scripts/prepare-serpro-report.ts \
  --cnpj CNPJ_AUTORIZADO \
  --rfb-text /privado/sitfis-extraido.txt \
  --rfb-pdf /privado/sitfis.pdf \
  --pgfn-json /privado/devedor.json \
  --collected-at DATA_ISO_DA_COLETA \
  --report-id IDENTIFICADOR_FS --version 1 \
  --output /privado/relatorio-fs.json
npm run parecer:gerar -- --input /privado/relatorio-fs.json --output /privado/Parecer_FS_v1.pdf
```

O texto extraído deve corresponder ao PDF informado. Conferir a extração visualmente, totais, data-base, identidade e todos os registros antes de arquivar. Os hashes registram os arquivos utilizados; não substituem essa conferência.

## Sistema / agente

`POST /api/agent/reports`, com as mesmas credenciais privadas do acervo (`Authorization: Bearer ...` e `x-fs-requester-phone` autorizado), recebe JSON:

```json
{ "externalId": "protocolo-da-emissao-v1", "report": "objeto DiagnosticReport, não string" }
```

O servidor valida, gera o PDF oficial e guarda payload e PDF. Retorna `id`, `reportUrl` e `pdfUrl`; esses caminhos do navegador exigem login. Para entrega pelo agente, recuperar os bytes na API privada `/api/agent/documents/:id`.

Protocolo e conteúdo iguais reutilizam a emissão. Alteração exige nova versão/protocolo; conflito retorna 409. Não enviar HTML/PDF livre a este endpoint. O endpoint antigo `/api/agent/documents` permanece para fontes/documentos legados.

No acervo, **Ver diagnóstico** abre `/diagnostico/:documentId`: indicadores, quatro partes, 17 seções e tabelas complementares. Baixar/imprimir recupera o PDF arquivado, sem consultar Serpro. Documentos de apoio continuam separados. A demonstração é aberta apenas por opção explícita.

## Limite atual

A emissão e o arquivamento de evidências coletadas estão conectados. Isso não ativa o botão de nova consulta, a fila pausada da Contabo nem o envio real de WhatsApp. O worker legado ainda precisa encaminhar seu `DiagnosticReport` para a API canônica antes da homologação automática. Não apresentar esse fluxo como já homologado de ponta a ponta.

## Acervo por empresa e atualização automática

A tela de Diagnóstico abre com cabeçalho navy e formulário “Analisar uma empresa”, seguido pelo acervo agrupado por CNPJ. Cada empresa tem um seletor de todos os pareceres/versões e documentos de apoio, prévia de PDF no painel e acesso ao diagnóstico estruturado quando disponível. Arquivos legados sem JSON continuam disponíveis como PDF, sem conversão presumida em diagnóstico.

A busca por nome ou arquivo inclui os demais documentos do mesmo CNPJ. Empresas diferentes continuam separadas; o documento de homologação permanece identificado como teste. Não há limite visual de cinco documentos ocultando versões.

O acervo se atualiza a cada 15 segundos quando a tela está visível, ao recuperar foco, ao voltar para a aba e ao recuperar conexão. Atualizações preservam a seleção do usuário, cancelam respostas antigas e não consultam provedores fiscais. O service worker continua sem cache de PDFs, dados fiscais ou sessões. Alterações de código exigem carregar a versão nova do aplicativo; a atualização automática trata a chegada de documentos ao acervo.
