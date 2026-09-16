# Serpro × parecer SOS Tributo — FS Soluções Tributárias

Pesquisa em 15/09/2026. Base: `materiais-cliente/Parecer_SOSTributo_GPA_Construcoes.pdf`, 11 páginas. Foram consultadas páginas oficiais e documentação pública; não houve consulta real de contribuinte, contratação ou alteração de produção.

## Decisão recomendada

Usar APIs como fonte de dados do agente, com complementação documental para o parecer completo. O Integra Contador/SITFIS tem aderência direta à emissão do relatório fiscal. A Consulta Dívida Ativa ajuda no inventário e acompanhamento de inscrições, mas sua documentação pública não comprova cobertura suficiente para substituir todo o relatório detalhado do Regularize ou sustentar sozinha as simulações do modelo.

O formato visual do parecer pode ser reproduzido independentemente da fonte. O obstáculo é a disponibilidade e a comprovação dos dados, não a geração do PDF.

## Cobertura do modelo

| Informação exigida | Cobertura comprovada ou limite encontrado |
|---|---|
| Relatório de situação fiscal | SITFIS emite PDF oficial; exige extração/validação para alimentar o parecer. |
| Inscrições PGFN e valores consolidados | Consulta por CNPJ lista inscrições; consulta por inscrição fornece detalhamento cadastral e da cobrança. |
| Principal, multa, juros e encargo separados | Não localizados nos exemplos públicos da API comercial pesquisada. Exigir demonstração do retorno antes de considerar atendido. |
| Natureza da dívida, situação e referência judicial | Campos documentados; referência judicial não substitui a leitura dos autos. |
| CAPAG, rating B/C/D e memória de cálculo | Não localizados nos serviços públicos pesquisados. Complementar pelo Regularize/documentos. |
| Rescisão e impedimento para nova negociação | Há códigos de situação, mas não foi comprovado histórico completo com datas e condições. |
| Balanço, DRE, fluxo de caixa e provas para revisão de CAPAG | Dependem dos documentos contábeis da empresa. |
| Editais aplicáveis, descontos, prazos e estratégia judicial | Dependem de regras atualizadas, enquadramento e revisão profissional; não são uma conclusão entregue pela API. |

Fontes: [SITFIS](https://apicenter.estaleiro.serpro.gov.br/documentacao/api-integra-contador/pt/solucoes/integra-sitfis/sitfis/), [emissão do PDF](https://apicenter.estaleiro.serpro.gov.br/documentacao/api-integra-contador/pt/solucoes/integra-sitfis/sitfis/servicos/emitir_relatorio/), [campos da Consulta Dívida Ativa](https://apicenter.estaleiro.serpro.gov.br/documentacao/consulta-divida-ativa/pt/global/servicos_api_macro/), [catálogo Integra Contador](https://apicenter.estaleiro.serpro.gov.br/documentacao/api-integra-contador/pt/catalogo_de_servicos/).

A loja anuncia a Consulta Dívida Ativa para dívidas tributárias não previdenciárias. Portanto, não assumir cobertura integral de débitos previdenciários/FGTS. O exemplo técnico inclui natureza não tributária, indicando necessidade de confirmar comercialmente o universo coberto. Não confundir esse produto com outros serviços de dados do Serpro que exibem campos diferentes. [Produto oficial](https://loja.serpro.gov.br/product/consulta-divida-ativa).

## Custos publicados

Integra Contador: consulta R$ 0,24 na faixa de 1–300; emissão R$ 0,32 na faixa de 1–500. A emissão cai para R$ 0,29 de 501–5.000. A loja informa cobrança por consumo na faixa atingida. O relatório SITFIS é uma emissão. [Tabela oficial — aba Preço](https://loja.serpro.gov.br/product/integracontador).

Consulta Dívida Ativa: até 999 chamadas/mês, R$ 0,6591 por chamada; 1.000–9.999, R$ 0,5649; 10.000–49.999, R$ 0,3557. Aplica-se a tarifa da faixa ao total mensal de consultas. [Tabela oficial — aba Preço](https://loja.serpro.gov.br/product/consulta-divida-ativa).

Estimativa para uma empresa com nove inscrições, como no parecer: uma chamada por CNPJ, nove chamadas de detalhe e uma emissão SITFIS. Premissas: protocolo de apoio gratuito, uma emissão faturável por relatório, nenhuma repetição/consulta adicional e nenhum outro consumo no contrato.

| Análises/mês | Chamadas PGFN | PGFN | SITFIS | Total Serpro | Média/análise |
|---:|---:|---:|---:|---:|---:|
| 1 | 10 | R$ 6,591 | R$ 0,32 | R$ 6,91 | R$ 6,91 |
| 50 | 500 | R$ 329,55 | R$ 16,00 | R$ 345,55 | R$ 6,91 |
| 100 | 1.000 | R$ 564,90 | R$ 32,00 | R$ 596,90 | R$ 5,97 |
| 500 | 5.000 | R$ 2.824,50 | R$ 160,00 | R$ 2.984,50 | R$ 5,97 |

São custos de coleta parcial, não do parecer completo. Não incluem OpenAI, Z-API, VPS, manutenção ou complementação humana. Mais inscrições aumentam o número de detalhes consultados. Se bastar a lista resumida, uma chamada por CNPJ pode substituir as dez, com perda de detalhamento.

Integra Contador informa faturamento de respostas 200, 202 e 403, excetuados serviços gratuitos de apoio/monitoramento. Na dívida ativa, a FAQ lista 200, 206 e 404 como faturáveis. Repetições e negativas podem gerar custo. A FAQ da dívida ativa informa operação em dias úteis, das 7h às 22h; confirmar janela/fuso/SLA no contrato. [FAQ Integra](https://apicenter.estaleiro.serpro.gov.br/documentacao/api-integra-contador/pt/faq/), [FAQ Dívida Ativa](https://apicenter.estaleiro.serpro.gov.br/documentacao/consulta-divida-ativa/pt/faq/).

## Implicações para o agente

Vantagens: as consultas cobertas passam a usar integração oficial, sem navegação/captcha; menor dependência de telas; dados estruturados para PGFN; execução possível na VPS; registro de fontes e acompanhamento periódico.

Limitações: duas contratações, consumo variável, procurações/certificado no Integra, cobertura incompleta, indisponibilidades e janela de consulta. O PDF SITFIS ainda precisa ser interpretado. Usar APIs não elimina a necessidade de evidências contábeis e judiciais.

Fluxo proposto: WhatsApp → autorização do solicitante/CNPJ → fila → SITFIS e consulta PGFN → documentos complementares pelo conector Mac ou upload → validação dos valores e fontes → geração do parecer pela LLM → revisão quando necessária → entrega e histórico de correções. A ausência de uma fonte deve produzir pendência explícita, nunca um valor presumido.

Para executar Integra na VPS, ela precisará acessar as credenciais e o e-CNPJ correspondente ao contratante; não basta possuir a chave da API. Alternativamente, a chamada autenticada pode continuar no Mac. A procuração do contribuinte permanece necessária nos serviços que a exigem. [Autenticação](https://apicenter.estaleiro.serpro.gov.br/documentacao/api-integra-contador/pt/quick_start/).

## Validação antes da adoção completa

1. Obter resposta oficial do Serpro sobre composição principal/multa/juros/encargo, CAPAG, histórico de negociação e universo de dívidas cobertas.
2. Comparar um retorno real autorizado com os PDFs obtidos no portal na mesma data: inscrições, totais e informações ausentes.
3. Confirmar tarifas contratuais, respostas faturáveis e janela de operação. Não pressupor teste gratuito que não foi confirmado nesta pesquisa.
4. Manter o fluxo existente do cliente até que a comparação demonstre quais etapas podem ser substituídas.

O projeto contém um adaptador SITFIS com testes simulados; isso não constitui homologação com Serpro real.

## Qualidade do parecer-modelo

O documento mistura valores de duas referências: PGFN R$ 23.204.094,42 + RFB R$ 424.850,20 resulta em R$ 23.628.944,62. O total de R$ 23.485.091,26 corresponde à outra referência PGFN de R$ 23.060.241,06. O agente deve conservar datas e fontes separadas e reconciliar os valores.

Também há cenários de parcelamento diferentes entre o resumo e a discussão posterior. O modelo deve orientar estrutura e apresentação; valores, elegibilidade e prazos precisam ser recalculados e fundamentados para cada caso.
