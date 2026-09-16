---
name: parecer-fiscal
description: Produz o parecer/diagnóstico fiscal em PDF no padrão da casa — dashboard de abertura com KPIs, roscas e quadro de desembolso, seguido das Partes I a IV (diagnóstico do passivo, transação e rating, via de urgência, recomendações e conclusão). Usar SEMPRE que o usuário pedir diagnóstico, parecer, análise fiscal, simulação de transação tributária, quadro de desembolso ou proposta de redução de passivo para um cliente, e também quando ele apenas anexar extrato do Regularize, consulta CAPAG/SISPAR, relatório de inscrições em dívida ativa ou situação fiscal do e-CAC e pedir "monta o diagnóstico", "faz o parecer", "roda esse cliente" ou equivalente. Vale para passivo na PGFN, na RFB, para encontro de contas e para casos de bloqueio por rescisão.
---

# Parecer / diagnóstico fiscal — padrão da casa

Documento de venda técnica: o cliente precisa ver, na primeira página, quanto
deve, quanto pode economizar, quanto sai do caixa por mês e o que trava. O resto
do documento sustenta esses quatro números com base normativa e aritmética
aberta.

Saída: **PDF A4 retrato**, gerado de HTML + CSS via WeasyPrint. Nunca DOCX, nunca
resposta só em chat — o artefato é o PDF.

## Fluxo

1. **Levantar a base.** Ler os documentos anexados (Regularize, CAPAG/SISPAR,
   e-CAC, execução fiscal). Extrair inscrição por inscrição: número, data,
   tributo, natureza, principal e acessórios. Se faltar dado essencial, perguntar
   de uma vez só — não montar o parecer com número presumido.
2. **Rodar a aritmética.** Montar `dados.json` (schema no cabeçalho de
   `scripts/calc.py`) e executar:
   `python3 scripts/calc.py dados.json --out blocos.html`
   Ele devolve os campos formatados em pt-BR, as tabelas em HTML e os dois SVG.
   Nunca calcular à mão o que o script calcula.
3. **Ler `references/estrutura.md`** e escrever o texto do caso. O template dá a
   forma; o valor está no que só se diz sobre aquele contribuinte.
4. **Montar o HTML.** Copiar `assets/template.html` e `assets/parecer.css` para a
   pasta de trabalho, substituir os `{{CAMPOS}}`, colar os blocos do
   `blocos.html`, apagar os blocos que não se aplicam.
5. **Gerar o PDF:**
   `python3 scripts/build.py parecer.html /mnt/user-data/outputs/Parecer_<Cliente>.pdf`
6. **Conferir e entregar.** Abrir o PDF, verificar quebras de página (nenhuma
   tabela partida ao meio, nenhum título órfão no fim da página) e entregar com
   `present_files`.

## Dados mínimos para começar

Sem estes, o parecer não fecha:

- inscrições com principal e acessórios separados (ou o consolidado e o total de
  multa, juros e encargo);
- débitos ainda na RFB, não inscritos — é o que trava a certidão conjunta;
- CAPAG e rating, se houver consulta SISPAR;
- receita bruta do último exercício, se a Parte III for penhora de faturamento;
- situação para transação: livre, bloqueada, com negociação rescindida, e desde
  quando;
- número da execução fiscal, se ajuizado.

## Regras que dão credibilidade ao documento

**Lastro.** Todo número vem de documento ou de informação expressa do
contribuinte. Informação prestada verbalmente entra dita como tal no texto e
volta nas ressalvas. Não inventar prazo de tramitação, data de decisão, descrição
de como o Fisco processa o pedido, jurisprudência ou número de processo. O que
falta vira providência na seção 14 ou marcação `A APURAR`.

**Cenário não é realidade.** Se o rating hoje é A ou B, o desconto simulado
depende de reclassificação: dizer isso no painel do score, na leitura da seção 7
e na primeira ressalva. Um parecer que promete o que não está disponível
destrói a relação no primeiro indeferimento.

**Aritmética aberta.** A caixa "Conferência do quadro" mostra a conta, não o
resultado. É o que permite ao cliente (e ao contador dele) refazer o cálculo.

**A caixa que limita.** Toda Parte III leva uma caixa "O que este parecer não
promete" com o limite real do instrumento proposto. É o que separa parecer de
folheto de venda.

**Citação verificada.** Dispositivo conferido, edital conferido no ano vigente.
Sem confirmação, escrever o dispositivo genérico e marcar `[A CONFIRMAR]`.

## Tom

Frase curta e afirmativa. Sem adjetivo de venda, sem "importante ressaltar", sem
promessa. O documento convence pela ordem dos números e pela precisão do
diagnóstico, não pelo entusiasmo. Títulos de seção descrevem o que a seção
resolve ("Capacidade de pagamento e rating — o obstáculo deste caso"), não o
assunto genérico.

## Forma

- Valores sempre `R$ 1.234.567,89`; percentuais com vírgula e duas casas.
- Números críticos em vermelho (`class="critico"`), positivos em verde
  (`class="positivo"`); no resto, cor só nos elementos estruturais.
- Marca: a logo entra depois. Manter o bloco de texto da marca no cabeçalho e o
  `<img src="logo.png">` comentado no template; quando o usuário fornecer o
  arquivo, salvar como `logo.png` ao lado do HTML e descomentar a linha.
- Fidelidade tipográfica: instalar Carlito, se disponível
  (`apt-get install -y fonts-crosextra-carlito`); sem ela, o fallback já
  configurado resolve.
- Nome do arquivo: `Parecer_<Marca>_<Cliente>.pdf` ou
  `Diagnostico_<Cliente>.pdf`.

## Arquivos da skill

| Arquivo | Quando abrir |
|---|---|
| `assets/template.html` | sempre — é o esqueleto a copiar |
| `assets/parecer.css` | não precisa editar; só se o cliente pedir mudança de paleta |
| `scripts/calc.py` | sempre — schema no cabeçalho, gera números, tabelas e SVG |
| `scripts/build.py` | sempre — HTML para PDF |
| `references/estrutura.md` | antes de escrever o texto: o que entra em cada seção e as variantes por tipo de caso |
| `references/metodologia.md` | ao explicar os números: regra do desconto, faixas de rating, prazos por categoria, penhora de faturamento, base normativa |
