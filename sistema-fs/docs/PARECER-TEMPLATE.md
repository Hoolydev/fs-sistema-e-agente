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

## Limite atual

O sistema apresenta o template e exporta o PDF demonstrativo. Consultas reais, preenchimento automático dos dados e revisão/assinatura técnica ainda dependem da integração e dos documentos do cliente. Não há coleta fiscal realizada por este ajuste.

## Verificação

`npm run test:diagnostico`, `npm run build`, lint dos arquivos alterados; conferência visual de todas as páginas do PDF e da tela em 1440px e 375px. PDF: `output/pdf/FS-Parecer-Demonstrativo.pdf` na raiz do projeto FS.
