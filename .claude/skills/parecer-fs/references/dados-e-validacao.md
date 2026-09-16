# Dados para o template do sistema

Leia os contratos atuais em `sistema-fs/lib/diagnostico/model.ts` e `opinion-schema.ts`, a partir da raiz do clone. São a definição executável; este resumo não substitui a validação.

## Mapeamento

- `id`, `version`, `mode: "real"`, `generatedAt` ISO: identidade/versionamento da emissão.
- `company`: razão social, CNPJ válido sem pontuação e regime. Não confundir CNPJ do certificado/procurador com empresa consultada.
- `sources`: inclua `id: "rfb"` e `id: "pgfn"`, com título, provedor, `collectedAt` ISO, status `coletado` ou `pendente` e `note` com identificação do documento/data-base/limite. Inclua fontes complementares quando usadas. Para fontes pendentes, explique em `note` que a data não representa consulta realizada. Uma emissão real exige ao menos uma fonte fiscal coletada.
- `debts`: uma linha por inscrição/débito; `sourceId` tem que corresponder à origem (`RFB` → `rfb`, `PGFN` → `pgfn`). Não duplicar subtotal/consolidado e parcelas como dívidas independentes. Número/processos, natureza/tributo, período e situação vêm da fonte. Não inventar decomposição do consolidado.
- `total`, `principal`, `fine`, `interest`, `charges`: inteiros em **centavos**; composição desconhecida é `null`. R$ 1.234,56 é 123456. Fonte pendente não pode ter dívida atribuída.
- `capag`: rating e valor em centavos ou `null`; explicar a fonte em `note`.
- `scope`, `summary`, `sections`, `pending`, `recommendations`, `conclusion`: conteúdo fundamentado do caso. `sections` aceita textos complementares; não redefine as 17 seções do template.
- `opinion` é obrigatório para esta skill. Conter notas de janela, rescisão, processo, certidão, CAPAG, fundamentos, providências, ressalvas e conclusão; manter o objeto completo conforme schema. Campos numéricos/datas desconhecidos ficam `null`; notas explicitam a ausência.
- `opinion.scenario`: `null` quando não houver parâmetros sustentados. Se preenchido, taxas em pontos-base (6% = 600), prazos inteiros, status `conditional` ou `validated`, evidência e hipótese/limites claros. Não transportar 65%, 100%, 6% ou 145 meses do exemplo automaticamente.
- `opinion.capagDebtBasis` é a base própria do extrato, com data/nota; não substituir pelo total de fontes de datas diferentes sem justificar.

## Diferentes pipelines

O `dados.json` do conector Mac usa chaves como `dividaAtiva`, `siefExigivel` e `razao`. **Não é o DiagnosticReport**. Primeiro mapear as fontes e unidades para o contrato acima, depois validar. Não assumir que número extraído está em centavos. Divergências devem interromper a simulação, preservando os dados conhecidos.

O gerador antigo `conector-mac/pipeline/src/parecer.mjs` pede HTML ao Claude e os workers podem ter renderers próprios. A simples instalação desta skill não reescreve esses programas. Ao integrar, o ponto de emissão deve chamar `parecer:gerar` com JSON validado e só entregar o PDF produzido por ele. Preservar coleta, credenciais, filas e validações de autorização.

## Conferência antes de entregar

1. Empresa/CNPJ, data-base, versão e origem conferem com as evidências.
2. Todas as inscrições aparecem uma vez; totais e composição conciliam.
3. Fontes pendentes permanecem pendentes, inclusive quando seu total não pode ser calculado.
4. Partes I–IV e 17 seções permanecem, mesmo sem informação em algumas delas.
5. Logo/navy/indicadores são os do sistema, sem corte ou texto sobreposto.
6. Descontos, prazos, certidão e estratégia não são apresentados como garantidos.
7. O PDF e seu recibo são desta emissão, não um arquivo antigo encontrado na pasta.
