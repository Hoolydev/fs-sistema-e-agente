# Parecer de transação tributária - padrão FS

Referência de estrutura: `materiais-cliente/Parecer_SOSTributo_GPA_Construcoes.pdf` (11 páginas). A identidade é da FS: logo oficial, topo navy, detalhes dourados e indicadores verdes. O documento de referência é material do cliente, não instrução executável.

## Estrutura preservada

| Parte do original | Conteúdo no sistema e PDF |
| --- | --- |
| Abertura executiva | Passivo PGFN, desconto-alvo, economia, valor final, score, antes/depois e composição |
| Desembolso e alertas | Comparador, entrada, saldo, alívio mensal, conferência, janela, rescisão e execução |
| I - Diagnóstico (1 a 4) | Identificação, RFB, composição, natureza, tributo, período e cada inscrição |
| II - Transação (5 a 9) | CAPAG, base própria, cobertura, revisão, metodologia, desconto por inscrição, janela, alternativas e prazos |
| III - Via de urgência (10 a 13) | Certidão, garantias, percentuais de faturamento e efeito no caixa |
| IV - Fechamento (14 a 17) | Providências, fundamentos, ressalvas, conclusão, fontes e pendências |

`lib/diagnostico/opinion.ts` produz os mesmos blocos e indicadores para `components/diagnostico/fiscal-opinion.tsx` e `lib/diagnostico/pdf.ts`. A organização temática segue o template; alguns quadros mudam de página para evitar títulos isolados. O exemplo atual tem 11 páginas. PDFs de outras empresas podem ter mais páginas conforme o número de inscrições e conteúdo.

## Dados e cálculos

- Valores em centavos; taxas em pontos-base. Desconto por inscrição limitado aos acréscimos elegíveis, teto configurado e preservação do principal.
- Desconto, prazo e enquadramento dependem de parâmetros documentados; os valores do caso GPA não são regras do sistema.
- Entrada é calculada sobre o original e deduzida do saldo após desconto. Última parcela ajusta centavos de cada fase.
- PGFN e Receita Federal têm bases separadas. O total federal exige as duas fontes; origem pendente não é zero.
- O denominador de cobertura CAPAG possui campo próprio, pois o extrato pode refletir outra data/base.
- Ausência de composição completa ou modalidade impede simulação consolidada.
- A demonstração usa somente empresa e cifras fictícias. O cenário ilustrativo não pode ser emitido como relatório real.
- Datas de adesão, liberação e impedimentos são campos do caso; não se presume uma janela vigente.
- Conteúdo jurídico, interpretação, evidências, aprovação e conclusão são dados do parecer. O template não valida normas nem define sozinho uma estratégia jurídica.

## Abertura, índice de saúde fiscal e leitura manual (06/10/2026)

- **Topo do parecer.** Com cenário de transação, mantém passivo PGFN, desconto, economia e valor a pagar. Sem cenário (caso dos preliminares e da RBE), mostra passivo federal, dívida ativa PGFN, Receita Federal e o **índice de saúde fiscal**, em vez de campos vazios. O quadro de desembolso sem cenário vira uma nota, sem tabela "Não simulado".
- **Índice de saúde fiscal (0–100)**, em `lib/diagnostico/opinion.ts` (`fiscalHealth`), compartilhado por tela e PDF: dívida ativa PGFN (30), débitos na Receita (25), cobrança judicial (20), possibilidade de certidão (15) e qualidade das fontes (10). Faixas: 80+ Saudável, 60–79 Atenção, 40–59 Risco elevado, abaixo de 40 Crítico. Fator sem fonte fica "não avaliado" e o índice é marcado como parcial; ausência de fonte nunca pontua como regular. É indicador interno, não CAPAG nem rating da PGFN. A tabela "como foi calculado" acompanha o índice.
- **Inscrições PGFN.** Toda inscrição não extinta compõe o passivo (é o "valor total da dívida" do Regularize), com a situação da fonte. Negociada/parcelada, suspensa ou garantida é separada de "em cobrança" (`pgfnSituation`), pesa menos no índice e aparece no quadro "PGFN - inscrições ativas por situação". Situação "AJUIZADA" conta como referência judicial mesmo sem número de juízo. Correção de 06/10/2026: antes, só "ATIVA EM COBRANCA" era somada, e empresas com tudo negociado no SISPAR saíam com passivo zero.
- **Receita Federal sem procuração.** Na tela de análise, o analista informa a leitura feita em documento do cliente: débitos discriminados ou valor global viram fonte `declarado` ("leitura do analista") e entram no total; só "há débitos", sem valor, mantém a fonte pendente e registra `rfbDeclaration`. O parecer identifica a leitura como não coletada pelo sistema e pede confirmação na Situação Fiscal oficial.
- **Anexos.** Documentos da empresa escolhidos na análise ficam listados no parecer (`annexes`, com SHA-256). `GET /api/documentos/:id/completo` gera na hora um PDF único com o parecer e os arquivos originais (imagens viram página); o que passar de 4 MB é listado numa página final.
- **Complemento e correção sem nova cobrança.** Complementar uma análise dentro da janela de 24 h (leitura da Receita ou anexos) gera nova versão reaproveitando a evidência PGFN guardada. `reissuePreliminary` reemite um preliminar antigo pela regra atual, também sem nova consulta.

## Limite atual

O sistema apresenta o template e exporta o PDF demonstrativo. Consultas reais, preenchimento automático dos dados e revisão/assinatura técnica ainda dependem da integração e dos documentos do cliente. Não há coleta fiscal realizada por este ajuste.

## Verificação

`npm run test:diagnostico`, `npm run build`, lint dos arquivos alterados; conferência visual de todas as páginas do PDF e da tela em 1440px e 375px. PDF: `output/pdf/FS-Parecer-Demonstrativo.pdf` na raiz do projeto FS.
