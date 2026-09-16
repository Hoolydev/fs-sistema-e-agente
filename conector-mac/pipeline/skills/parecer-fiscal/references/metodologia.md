# Metodologia de cálculo e base normativa

O `scripts/calc.py` já implementa tudo o que está aqui. Esta referência serve
para explicar os números no texto e para conferir o que o script devolveu.

## 1. Desconto por inscrição

Por inscrição, nunca sobre o consolidado:

1. desconto máximo I = 100% de (multa + juros + encargo legal)
2. desconto máximo II = 65% do valor consolidado da inscrição
3. desconto aplicado = menor entre I e II
4. valor final = total − desconto

O principal nunca é reduzido (art. 11, §2º, I, da Lei nº 13.988/2020). Quando os
acessórios são menores que 65% do consolidado, o desconto zera multa, juros e
encargo e o valor a pagar coincide com o principal — é o cenário-teto. Quando
passam de 65%, o teto corta, sobra acessório e o valor a pagar fica acima do
principal: nesse caso, dizer isso no texto, porque muda a leitura do quadro.

## 2. Faixas e desconto

- Rating A e B: prazo e entrada facilitada, sem desconto.
- Rating C (difícil recuperação) e D (irrecuperável): descontos sobre multa,
  juros e encargos — art. 11, I, da Lei nº 13.988/2020.
- Cobertura = capacidade de pagamento em 60 meses ÷ passivo federal total.
  Cobertura alta é o que empurra o contribuinte para A/B.
- Revisão da capacidade de pagamento: Portaria PGFN nº 6.757/2022. É a via para
  migrar de B para C/D com documentação econômico-financeira real.

Quando o rating hoje é A ou B, o desconto simulado é **cenário-alvo condicionado**.
Isso precisa aparecer em três lugares: no painel do score, na leitura do quadro
da seção 7 e na primeira ressalva. Não é excesso de cautela: é o que impede o
cliente de ler a economia como disponível.

## 3. Desembolso

- Entrada = percentual do edital (usualmente 6%) sobre o valor **sem** desconto.
- Entrada mensal = entrada ÷ número de parcelas da entrada.
- Saldo = valor com desconto − entrada.
- Parcela do saldo = saldo ÷ número de prestações.
- Comparativo: parcelamento convencional (Lei nº 10.522/2002) = passivo ÷ 60.
- Alívio = 1 − (desembolso mensal ÷ parcela convencional).

Prazos por categoria, no desenho usual da transação por adesão:

| Categoria | Regime especial (PF, MEI, ME, EPP, cooperativas, Santas Casas, instituições de ensino) | Regime geral |
|---|---|---|
| Entrada | 6% em 12 parcelas | 6% em 6 parcelas |
| Demais débitos | 133 prestações (145 meses) | 114 prestações (120 meses) |
| Previdenciário | 48 prestações (60 meses) | 48 prestações (60 meses) |

O limite previdenciário de 60 meses é constitucional (art. 195, §11, da CF) e não
se contorna por edital. Se não houver inscrição previdenciária, dizer isso
expressamente na nota do quadro — evita a pergunta.

Se o contribuinte não se enquadra no regime especial, o quadro de abertura pode
usar o desenho mais favorável, desde que a seção 9 mostre o regime aplicável e a
projeção conservadora trabalhe com ele.

## 4. Penhora de faturamento

- Base: receita bruta anual ÷ 12.
- Percentuais simulados: 1%, 2%, 3% e 5%; cobertura em meses = passivo ÷ valor mensal.
- Faixa usualmente recomendada: 2% a 3%, calibrada para ficar na ordem de
  grandeza da prestação da transação.
- Base legal: arts. 835, X, e 866 do CPC; Tema repetitivo 769/STJ.
- Limite real: penhora insuficiente não garante CPD-EN. A certidão do art. 206
  do CTN exige garantia suficiente, o que costuma demandar complemento por
  seguro-garantia ou fiança (art. 9º, II, da Lei nº 6.830/1980).
- Resíduo na RFB: enquanto houver débito não inscrito em aberto, não há certidão
  conjunta. Verificar sempre — costuma ser o item de melhor custo-benefício do
  parecer inteiro.

## 5. Base normativa recorrente

| Diploma | Uso |
|---|---|
| Lei nº 13.988/2020 | transação; art. 4º, §4º (2 anos após rescisão); art. 11, I e §2º, I; art. 3º, IV (confissão irrevogável) |
| Leis nº 14.375/2022 e 14.689/2023 | alterações da transação |
| Portaria PGFN nº 6.757/2022 | classificação e revisão da capacidade de pagamento |
| Edital PGDAU do ano | corte de inscrição, teto por sujeito passivo, entrada e prazos |
| CTN | art. 206 (CPD-EN); arts. 150, §4º, e 173 (decadência) |
| CPC | art. 835, X; art. 866 (penhora de faturamento) |
| Lei nº 6.830/1980 | art. 9º, II (seguro-garantia e fiança); art. 2º, §5º (requisitos da CDA) |
| Lei nº 10.522/2002 | parcelamento convencional |
| Lei nº 14.133/2021 | art. 68 (regularidade fiscal em licitação) |

Conferir número e ano do edital vigente na data do parecer antes de citá-lo. Se
não houver como confirmar, escrever o dispositivo genérico e marcar
`[A CONFIRMAR: nº do edital]` em vez de arriscar citação errada.

## 6. Regra de lastro

Só entra no parecer número que veio de documento (Regularize, SISPAR, e-CAC,
DCTF, balanço) ou informação expressamente prestada pelo contribuinte — e, neste
segundo caso, com a origem dita no texto e repetida nas ressalvas.

Não inventar: prazo de tramitação administrativa, data de decisão, descrição de
como o Fisco processa o pedido, jurisprudência, número de processo. O que falta
vira providência na seção 14 ou marcação `A APURAR`.
