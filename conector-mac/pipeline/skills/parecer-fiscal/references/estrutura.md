# Estrutura do parecer — o que entra em cada bloco

Ler antes de escrever o texto. A ordem é fixa; o conteúdo de cada bloco varia
com o caso. Quando um bloco não se aplica, apagar o bloco inteiro em vez de
preenchê-lo com genérico.

## Índice
1. Página de abertura (dashboard)
2. Parte I — Diagnóstico do passivo (seções 1 a 4)
3. Parte II — Transação: classificação, simulação e janela (5 a 9)
4. Parte III — Via de urgência (10 a 13)
5. Parte IV — Recomendações e fechamento (14 a 17)
6. Variantes por tipo de caso

---

## 1. Página de abertura (dashboard)

Vende o trabalho e resume a tese em uma página. Sequência obrigatória:

| Elemento | Conteúdo |
|---|---|
| Título | sempre "PARECER DE ..." ou "DIAGNÓSTICO FISCAL — ..." |
| Linha fina | frase em itálico que nomeia os três eixos do caso, na ordem em que aparecem no corpo |
| Eixos | 4 expressões curtas separadas por " · " |
| Linha de identificação | razão social, CNPJ, base e data de cada fonte, número do processo |
| 4 KPIs | passivo · desconto-alvo · economia · valor a pagar |
| Painel esquerdo | rosca do percentual + rating hoje → alvo + barras "sem o trabalho / com o trabalho" |
| Painel direito | rosca da composição (principal / multa / juros / encargo) + base descontável |
| Quadro de desembolso | 4 KPIs de fluxo + tabela por categoria + tabela por etapa |
| Caixa "Conferência do quadro" | aritmética aberta, para o cliente refazer a conta |
| Banners | 1 a 3 faixas: prazo crítico (vermelho), dado a confirmar (âmbar), fato favorável (verde) |

A caixa de conferência é assinatura do documento: mostra a conta, não só o
resultado. Sai do `calc.py`, bloco "CONFERÊNCIA".

## 2. Parte I — Diagnóstico do passivo

- **1. Identificação** — tabela chave/valor. Sempre incluir: interessado, CNPJ,
  passivo inscrito, parcela em execução fiscal, débitos na RFB, CAPAG/rating,
  situação para transação, prazo crítico, objeto, fonte/data-base, natureza
  (confidencial). Valores críticos em vermelho (`class="critico"`).
- **2. Composição do débito** — principal / multa / juros / encargo, com % e
  total. Nota final: quanto é descontável e a vedação de redução do principal
  (art. 11, §2º, I, da Lei nº 13.988/2020).
- **3. Composição por natureza, tributo e ano** — três tabelas geradas pelo
  `calc.py`. Depois da 3.3, parágrafo lembrando que data de inscrição não é
  fato gerador e que a decadência das competências (arts. 150, §4º, e 173 do
  CTN) precisa ser verificada antes de qualquer confissão, já que a transação
  implica confissão irrevogável (art. 3º, IV).
- **4. Detalhamento por inscrição** — uma linha por inscrição, em ordem
  decrescente de valor, com total.

## 3. Parte II — Transação

- **5. CAPAG e rating** — tabela com capacidade, dívida PGFN, dívida RFB, total,
  cobertura e classificação. Em seguida, caixa "O ponto crítico" explicando o
  efeito do rating: A e B dão prazo e entrada, não dão desconto; desconto é
  privativo de C e D (art. 11, I, da Lei nº 13.988/2020).
- **5.1 Revisão da CAPAG** — só quando o rating é A ou B. Dizer com que dados a
  CAPAG presumida foi calculada, o que a fórmula não mede (margem, endividamento
  bancário, custo de obra, capital de giro) e listar os documentos da revisão
  (Portaria PGFN nº 6.757/2022).
- **6. Metodologia do desconto** — os quatro passos do cálculo. Depois, caixa
  dizendo se o teto de 65% foi ou não atingido em alguma inscrição.
- **7. Simulação inscrição por inscrição** — tabela do `calc.py` + caixa
  "Leitura do quadro" apontando o maior ganho isolado e a condicionante.
- **8. Janela de adesão** — edital aplicável, corte de inscrição, teto por
  sujeito passivo, prazo. Tabela "elemento × situação" quando há incompatibilidade
  de datas. Depois, tabela "as saídas" (o que é / viabilidade) e caixa com a
  sequência recomendada.
- **9. Variantes de prazo** — comparar o desenho apresentado na abertura com o
  regime efetivamente aplicável ao porte do contribuinte. Se o quadro de
  abertura usou o desenho mais favorável, dizê-lo aqui de forma expressa e
  mostrar a projeção conservadora.

## 4. Parte III — Via de urgência

Esta é a parte que muda mais de caso para caso. O padrão: identificar o problema
que não espera o calendário da transação e resolver por outro caminho.
Sequência de quatro seções:

- **10. O problema** — por que a certidão (ou o que estiver travado) importa
  para aquele setor em concreto: licitação, medição, crédito bancário,
  averbação de obra. Fundamentar (art. 206 do CTN; art. 68 da Lei 14.133/2021).
- **11. O instrumento** — o mecanismo escolhido, com base legal e jurisprudência
  (ex.: penhora de faturamento, arts. 835, X, e 866 do CPC; Tema 769/STJ).
  Sempre incluir caixa "O que este parecer não promete", com o limite real do
  instrumento. Essa caixa é o que separa parecer de folheto.
- **12. Dimensionamento** — tabela de percentuais e efeitos, seguida de caixa
  "Proposta" com a faixa recomendada e a razão da escolha.
- **13. Efeito combinado no caixa** — tabela de cenários (hoje / convencional /
  instrumento / transação) com três colunas de resposta: desembolso mensal,
  reduz o passivo?, produz certidão?

## 5. Parte IV — Fechamento

- **14. Recomendações** — tabela numerada, ordem de execução, coluna de prazo
  com valores qualitativos (imediato, curto prazo, paralelo, sequencial,
  permanente) ou data quando existir prazo legal ou de edital. Não inventar
  prazo em dias para etapa administrativa.
- **15. Fundamentação jurídica** — lista por diploma, com o dispositivo e o que
  ele resolve no caso. Só citação verificada.
- **16. Ressalvas** — o que é cenário e não realidade hoje; o que veio de
  informação do contribuinte e não de documento; o que depende de decisão
  judicial; data-base dos valores; e a ressalva de que o documento é de apoio à
  decisão.
- **17. Conclusão** — 4 a 5 parágrafos: o passivo em números, o obstáculo, a
  urgência, o caminho. Fechar com "É o parecer, salvo melhor juízo." e a linha
  de assinatura (cidade, data, marca).

## 6. Variantes por tipo de caso

| Caso | O que muda |
|---|---|
| Passivo só na RFB (nada inscrito) | Parte II trata do edital RFB aplicável e do contencioso administrativo; Parte III vira suspensão da exigibilidade / defesa |
| Rating C ou D já atribuído | 5.1 sai; o desconto deixa de ser cenário-alvo e passa a ser cenário disponível — ajustar KPIs e ressalva 1 |
| Encontro de contas (art. 100, §11) | Parte II trata da habilitação e do crédito; Parte III, da certidão e do risco de constrição |
| Bloqueio por rescisão | banner crítico + verificação do art. 4º, §4º, da Lei 13.988/2020 na abertura, como no modelo |
| Sem execução fiscal ajuizada | Parte III muda de penhora para depósito, seguro-garantia ou parcelamento-ponte |
