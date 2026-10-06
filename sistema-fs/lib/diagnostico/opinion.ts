import { formatCnpj, money, pgfnSituation, summarize, validateReport, type DiagnosticReport } from "./model";

export const percent = (v: number | null) => v === null ? "Não informado" : `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
export const shortDate = (v: string | null) => v ? new Date(v.length === 10 ? `${v}T12:00:00Z` : v).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Não informada";
// Monetary arithmetic is in cents. Basis-point multiplication uses integers even for large portfolios.
export function applyRate(cents: number, bps: number): number { return Number((BigInt(cents) * BigInt(bps) + BigInt(5000)) / BigInt(10000)); }
export function installments(total: number, count: number) {
  if (!Number.isSafeInteger(total) || total < 0 || !Number.isInteger(count) || count < 1) throw new Error("Parcelamento inválido");
  const regular = Math.floor(total / count);
  return { total, count, regular, last: total - regular * (count - 1) };
}
// Índice de saúde fiscal (0-100): indicador interno FS, calculado só com os dados do parecer. Não é CAPAG nem rating da PGFN.
// Fator sem dado fica "não avaliado" (pontos null) e o índice é marcado como parcial; fonte ausente nunca vale como "sem débitos".
export type HealthFactor = { label: string; reading: string; points: number | null; max: number };
export type HealthBand = { label: string; tone: "green" | "gold" | "orange" | "red" };
export const healthBand = (score: number): HealthBand => score >= 80 ? { label: "Saudável", tone: "green" } : score >= 60 ? { label: "Atenção", tone: "gold" } : score >= 40 ? { label: "Risco elevado", tone: "orange" } : { label: "Crítico", tone: "red" };
const band = (count: number, steps: [number, number][], fallback: number) => steps.find(([limit]) => count <= limit)?.[1] ?? fallback;
export function fiscalHealth(report: DiagnosticReport) {
  const status = (id: string) => report.sources.find(s => s.id === id)?.status ?? "pendente";
  const pgfnKnown = status("pgfn") !== "pendente", rfbKnown = status("rfb") !== "pendente", declaration = report.rfbDeclaration;
  const pgfn = report.debts.filter(d => d.origin === "PGFN"), rfbDebts = report.debts.filter(d => d.origin === "RFB");
  const rfbPresence = rfbKnown ? rfbDebts.length > 0 : declaration ? declaration.hasDebts : null;
  const rfbCount = rfbKnown ? rfbDebts.length : declaration ? (declaration.hasDebts ? declaration.count : 0) : null;
  const judicial = pgfn.filter(d => d.judicialProcess).length;
  // Negociada/parcelada, suspensa ou garantida pesa menos que "em cobrança", mas nunca vale como ausência de dívida.
  const inCollection = pgfn.filter(d => pgfnSituation(d.status) === "cobranca").length, managed = pgfn.length - inCollection;
  const sourcePoints = (id: string, full: number) => ({ coletado: full, declarado: Math.floor(full / 2), demonstrativo: 0, pendente: 0 })[status(id)];
  const factors: HealthFactor[] = [
    { label: "Dívida ativa (PGFN)", max: 30, points: !pgfnKnown ? null : !pgfn.length ? 30 : !inCollection ? 15 : band(inCollection, [[2, 20], [5, 12], [10, 6]], 0), reading: !pgfnKnown ? "Fonte PGFN pendente" : !pgfn.length ? "Nenhuma inscrição ativa" : `${pgfn.length} inscrições ativas${managed ? ` · ${inCollection} em cobrança, ${managed} negociadas/suspensas/garantidas` : " em cobrança"}` },
    { label: "Débitos na Receita Federal", max: 25, points: rfbPresence === null ? null : rfbPresence === false ? 25 : rfbCount === null ? 8 : band(rfbCount, [[0, 25], [3, 15], [10, 8]], 0), reading: rfbPresence === null ? "Não avaliado: Situação Fiscal pendente de procuração" : `${!rfbPresence ? "Sem débitos em cobrança" : rfbCount === null ? "Débitos informados, quantidade não informada" : `${rfbCount} débitos em cobrança`}${declaration && status("rfb") !== "coletado" && status("rfb") !== "demonstrativo" ? " (leitura do analista)" : ""}` },
    { label: "Cobrança judicial", max: 20, points: pgfnKnown ? (judicial === 0 ? 20 : judicial / pgfn.length <= .25 ? 12 : judicial / pgfn.length <= .5 ? 6 : 0) : null, reading: pgfnKnown ? (judicial ? `${judicial} de ${pgfn.length} inscrições com referência judicial` : "Sem referência judicial informada pela PGFN") : "Fonte PGFN pendente" },
    { label: "Possibilidade de certidão", max: 15, points: (pgfnKnown && inCollection > 0) || rfbPresence === true ? 0 : pgfnKnown && rfbPresence === false ? (managed ? 8 : 15) : null, reading: (pgfnKnown && inCollection > 0) || rfbPresence === true ? "Há débitos em cobrança: certidão negativa depende de regularização" : pgfnKnown && rfbPresence === false ? (managed ? "Só inscrições negociadas/suspensas/garantidas: certidão positiva com efeito de negativa depende da regularidade delas" : "Sem débitos em cobrança nas fontes") : managed ? "Inscrições PGFN negociadas/suspensas; avaliação depende da Receita Federal" : "Não avaliado sem a Receita Federal" },
    { label: "Qualidade das fontes", max: 10, points: sourcePoints("pgfn", 5) + sourcePoints("rfb", 5), reading: [["PGFN", status("pgfn")], ["Receita Federal", status("rfb")]].map(([name, s]) => `${name}: ${s === "declarado" ? "leitura do analista" : s}`).join(" · ") },
  ];
  const evaluated = factors.filter(f => f.points !== null), max = evaluated.reduce((sum, f) => sum + f.max, 0), earned = evaluated.reduce((sum, f) => sum + f.points!, 0);
  const score = max ? Math.round(earned / max * 100) : null;
  return { score, band: score === null ? null : healthBand(score), partial: max < 100, evaluatedMax: max, factors, rfbPresence, rfbCount };
}
export function opinionMetrics(report: DiagnosticReport) {
  const totals = summarize(report), debts = report.debts.filter(d => d.origin === "PGFN"), config = report.opinion?.scenario;
  const keys = ["principal", "fine", "interest", "charges"] as const;
  const composition = keys.map(key => debts.length && debts.every(d => d[key] !== null) ? debts.reduce((sum, d) => sum + d[key]!, 0) : null);
  const simulation = debts.map(d => {
    const complete = [d.principal, d.fine, d.interest, d.charges].every(v => v !== null);
    const eligible = complete ? d.fine! + d.interest! + d.charges! : null;
    const discount = config && eligible !== null ? Math.min(applyRate(eligible, config.chargesDiscountBps), applyRate(d.total, config.totalDiscountCapBps), eligible) : null;
    return { debt: d, discount, final: discount === null ? null : d.total - discount };
  });
  const discount = totals.pgfn !== null && simulation.length && simulation.every(d => d.discount !== null) ? simulation.reduce((sum, d) => sum + d.discount!, 0) : null;
  const final = totals.pgfn !== null && discount !== null ? totals.pgfn - discount : null;
  const entryTotal = config && totals.pgfn !== null && final !== null ? Math.min(applyRate(totals.pgfn, config.entryBps), final) : null;
  const entry = config && entryTotal !== null ? installments(entryTotal, config.entryMonths) : null;
  const balance = config && final !== null && entryTotal !== null ? installments(final - entryTotal, config.balanceMonths) : null;
  const conventional = config && totals.pgfn !== null ? installments(totals.pgfn, config.conventionalMonths) : null;
  const annual = report.opinion?.annualRevenue ?? null, monthlyRevenue = annual === null ? null : Math.round(annual / 12);
  return { totals, debts, composition, simulation, discount, final, entry, balance, conventional, monthlyRevenue, health: fiscalHealth(report), savingPercent: totals.pgfn && discount !== null ? discount / totals.pgfn * 100 : null, relief: conventional?.regular && entry ? (1 - entry.regular / conventional.regular) * 100 : null };
}
export type OpinionBlock =
 | { type: "heading"; text: string }
 | { type: "text"; text: string }
 | { type: "callout"; title: string; text: string; tone: "gold" | "red" | "green" }
 | { type: "table"; headers: string[]; rows: string[][] }
 | { type: "kpis"; items: { label: string; value: string; detail?: string; tone?: "navy" | "gold" | "green" | "orange" | "red" }[] }
 | { type: "charts" };
export type OpinionPage = { title: string; subtitle: string; blocks: OpinionBlock[] };
const h = (text: string): OpinionBlock => ({ type: "heading", text });
const p = (text: string): OpinionBlock => ({ type: "text", text });
const t = (headers: string[], rows: string[][]): OpinionBlock => ({ type: "table", headers, rows });
const call = (title: string, text: string, tone: "gold" | "red" | "green" = "gold"): OpinionBlock => ({ type: "callout", title, text, tone });
const installmentText = (plan: ReturnType<typeof installments> | null) => plan ? `${plan.count} parcelas · ${money(plan.regular)}; última ${money(plan.last)}` : "Não simulado";

export function buildOpinion(input: DiagnosticReport) {
  const report = validateReport(input), m = opinionMetrics(report), o = report.opinion, s = o?.scenario;
  const unknown = "Não informado. Depende de documentação e validação técnica.";
  const debtTotal = m.totals.pgfn, compNames = ["Principal (preservado)", "Multa", "Juros de mora", "Encargo legal"];
  const aggregate = (key: (d: DiagnosticReport["debts"][number]) => string) => [...new Set(m.debts.map(key))].map(value => {
    const found = m.debts.filter(d => key(d) === value), total = found.reduce((sum, d) => sum + d.total, 0);
    return [value, String(found.length), money(total), percent(debtTotal ? total / debtTotal * 100 : null)];
  });
  const capagBasis = o?.capagDebtBasis ?? null;
  const judicialDebts = m.debts.filter(d => d.judicialProcess);
  const days = o?.deadline ? Math.ceil((Date.parse(`${o.deadline}T23:59:59-03:00`) - Date.parse(report.generatedAt)) / 86400000) : null;
  const scheduleRows = [
    ["Convencional (comparador)", s ? `${s.conventionalMonths} meses` : "Não definido", installmentText(m.conventional)],
    ["Entrada sobre saldo original", s ? `Meses 1 a ${s.entryMonths}` : "Não definido", installmentText(m.entry)],
    ["Saldo após desconto e entrada", s ? `Meses ${s.entryMonths + 1} a ${s.entryMonths + s.balanceMonths}` : "Não definido", installmentText(m.balance)],
  ];
  const hl = m.health, declaration = report.rfbDeclaration, rfbDebts = report.debts.filter(d => d.origin === "RFB"), rfbDebtCount = rfbDebts.length, rfbSource = report.sources.find(s => s.id === "rfb");
  const managedPgfn = m.debts.filter(d => pgfnSituation(d.status) !== "cobranca");
  const pgfnDetail = !managedPgfn.length ? `${m.totals.count} inscrições ativas` : managedPgfn.length === m.totals.count ? `${m.totals.count} inscrições · todas negociadas/suspensas` : `${m.totals.count} inscrições · ${managedPgfn.length} negociadas/suspensas`;
  const healthValue = hl.score === null ? "Não avaliado" : `${hl.score}/100`, healthDetail = hl.band ? `${hl.band.label}${hl.partial ? " · parcial" : ""}` : "Fontes insuficientes";
  const rfbValue = m.totals.rfb !== null ? money(m.totals.rfb) : hl.rfbPresence ? "Há débitos" : "Pendente";
  const rfbDetail = m.totals.rfb !== null ? `${rfbDebtCount} débitos em cobrança${report.sources.find(x => x.id === "rfb")?.status === "declarado" ? " · leitura do analista" : ""}` : declaration?.hasDebts ? `${declaration.count === null ? "Quantidade" : `${declaration.count} débitos ·`} valor não informado` : "Aguardando procuração no e-CAC";
  // Sem cenário de transação simulado, o topo mostra o passivo apurado e o índice de saúde fiscal em vez de campos de desconto vazios.
  const openingKpis: Extract<OpinionBlock, { type: "kpis" }>["items"] = s
    ? [{ label: "PASSIVO INSCRITO · PGFN", value: money(debtTotal) }, { label: "DESCONTO-ALVO", value: percent(m.savingPercent), detail: s.targetRating, tone: "gold" }, { label: "ECONOMIA POTENCIAL", value: money(m.discount), tone: "green" }, { label: "VALOR A PAGAR · PGFN", value: money(m.final) }]
    : [{ label: "PASSIVO FEDERAL · RFB + PGFN", value: m.totals.total === null ? "A apurar" : money(m.totals.total), detail: m.totals.total === null ? "Receita Federal sem valor apurado" : "Passivo federal identificado", tone: "red" },
       { label: "DÍVIDA ATIVA · PGFN", value: money(debtTotal), detail: pgfnDetail },
       { label: "RECEITA FEDERAL", value: rfbValue, detail: rfbDetail },
       { label: "SAÚDE FISCAL", value: healthValue, detail: healthDetail, tone: hl.band?.tone ?? "navy" }];
  const healthBlocks: OpinionBlock[] = [
    h("Índice de saúde fiscal - como foi calculado"),
    t(["Fator", "Leitura nas fontes", "Pontos"], [...hl.factors.map(f => [f.label, f.reading, f.points === null ? `Não avaliado (${f.max})` : `${f.points} de ${f.max}`]), ["ÍNDICE", hl.band ? `${hl.band.label}${hl.partial ? ` · parcial: ${hl.evaluatedMax} de 100 pontos avaliados` : ""}` : "Fontes insuficientes", healthValue]]),
    p("Indicador interno da FS para priorizar o atendimento. Não é a CAPAG nem rating oficial da PGFN e não considera faturamento, garantias ou parcelamentos em curso. Fator sem fonte não é pontuado como regular."),
  ];
  const pages: OpinionPage[] = [
    { title: "PARECER DE TRANSAÇÃO TRIBUTÁRIA", subtitle: "Desconto por inscrição · Desembolso · CAPAG · Certidão e garantias", blocks: [
      p(`${report.company.name} · CNPJ ${formatCnpj(report.company.cnpj)} · Base ${shortDate(report.generatedAt)}`),
      { type: "kpis", items: openingKpis },
      { type: "charts" },
      // Com cenário, o desembolso vem logo após os gráficos e o detalhamento do índice fica no fim da abertura.
      ...(s ? [] : healthBlocks),
      h("Quadro de desembolso - o que sai do caixa"),
      // Sem cenário, a tabela seria toda "Não simulado": o quadro é substituído por uma nota até haver modalidade documentada.
      ...(s ? [{ type: "kpis" as const, items: [{ label: "CONVENCIONAL / MÊS", value: money(m.conventional?.regular ?? null) }, { label: "ENTRADA / MÊS", value: money(m.entry?.regular ?? null), tone: "gold" as const }, { label: "SALDO / MÊS", value: money(m.balance?.regular ?? null), tone: "green" as const }, { label: "ALÍVIO NA ENTRADA", value: percent(m.relief) }] }, t(["Etapa", "Período", "Valor nominal"], scheduleRows), call("Premissas do cenário", s.evidence)]
        : [call("Simulação de transação não realizada", "Comparador convencional, entrada e saldo dependem de modalidade, prazos e componentes do débito documentados. O quadro será preenchido quando esses parâmetros forem definidos; não há desconto ou prazo presumido neste parecer.")]),
      p(`Receita Federal: ${money(m.totals.rfb)}, separada desta simulação. Passivo federal identificado: ${money(m.totals.total)}. Valores nominais; eventual atualização não incluída.`),
      ...(s ? healthBlocks : []),
    ] },
    { title: "DESEMBOLSO E PONTOS DE ATENÇÃO", subtitle: "Conciliação das parcelas · Janela de adesão · Rescisão · Execução fiscal", blocks: [
      h("Conferência do quadro de desembolso"),
      t(["Componente", "Base de cálculo / resultado"], [
        ["Consolidado PGFN", money(debtTotal)], ["Redução simulada", money(m.discount)], ["Saldo após redução", money(m.final)],
        ["Entrada", `${s ? percent(s.entryBps / 100) : "Não definida"} sobre o original, limitada ao saldo · ${money(m.entry?.total ?? null)}`],
        ["Saldo a parcelar", money(m.balance?.total ?? null)], ["Conferência entrada + saldo", money(m.entry && m.balance ? m.entry.total + m.balance.total : null)],
      ]),
      p("Os valores são calculados em centavos. A última parcela de cada fase absorve a diferença de arredondamento, para que a soma das prestações corresponda exatamente ao saldo. A proposta efetiva deve ser conciliada com o cálculo oficial na data de adesão."),
      call("01 · Janela de adesão e liberação", `${o?.windowNote ?? unknown}\nPrazo de adesão: ${shortDate(o?.deadline ?? null)}. Liberação: ${shortDate(o?.releaseDate ?? null)}. ${days === null ? "Contagem regressiva indisponível." : days < 0 ? "Janela encerrada na data-base." : `Restam ${days} dias na data-base.`}`, "red"),
      call("02 · Verificar a data e a natureza da rescisão", o?.rescissionNote ?? unknown),
      call("03 · Execução fiscal e garantias", o?.judicialNote ?? unknown, "green"),
      h("Leitura conjunta"), p("O quadro econômico indica o potencial nominal da hipótese. A decisão depende de três verificações independentes: elegibilidade para negociar, capacidade de suportar o desembolso e estratégia para a regularidade fiscal. A simulação não confirma nenhuma dessas condições por si só."),
    ] },
    { title: "PARTE I - DIAGNÓSTICO DO PASSIVO", subtitle: "Identificação, composição e distribuição dos débitos", blocks: [
      h("1. Identificação"), t(["Informação", "Levantamento"], [
        ["Razão social / CNPJ", `${report.company.name}\n${formatCnpj(report.company.cnpj)}`], ["Regime / enquadramento", report.company.regime], ["Passivo inscrito (PGFN)", `${money(debtTotal)} · ${m.totals.count} inscrições`],
        ["Com referência judicial informada", judicialDebts.length ? `${judicialDebts.length} inscrições · ${money(judicialDebts.reduce((sum, d) => sum + d.total, 0))}` : "Não informada nas fontes; não comprova ausência de execução"],
        ["Receita Federal / federal total", `${money(m.totals.rfb)} / ${money(m.totals.total)}`], ["Classificação CAPAG", report.capag.rating ?? "Não informada"],
        ["Objeto do parecer", "Diagnóstico do passivo, simulação por inscrição, desembolso e frentes de regularização."], ["Data-base / natureza", `${shortDate(report.generatedAt)} · ${report.mode === "demo" ? "Demonstração com dados fictícios" : "Análise técnica para revisão"}`],
      ]),
      p(report.summary), p(report.scope),
      h("1.1. Pendências na Receita Federal"),
      // Sem débito da Receita, a tabela vazia não diz nada: explica se a fonte foi consultada e onde estão os demais registros.
      ...(rfbDebts.length ? [t(["Referência", "Tributo / período", "Situação", "Total"], rfbDebts.map(d => [d.id, `${d.tax} · ${d.period}`, d.status, money(d.total)]))]
        : [p(rfbSource?.status === "coletado" ? `O relatório de situação fiscal da Receita Federal não apresenta débitos em cobrança.${report.supplements?.some(s => s.title.startsWith("SITFIS")) ? " Parcelamentos, omissões de declaração e demais registros do relatório estão transcritos em Evidências complementares, sem somar ao passivo." : ""}` : rfbSource?.status === "declarado" ? "Nenhum débito da Receita Federal discriminado; ver a leitura do analista abaixo." : "Receita Federal não consultada nesta versão: depende de procuração à FS ou da leitura do analista.")]),
      ...(declaration ? [call("Leitura da Receita Federal pelo analista", `${declaration.analyst} informou ${declaration.hasDebts ? `a existência de débitos na Receita Federal${declaration.count !== null ? ` (${declaration.count} débitos)` : ""}` : "que não há débitos em cobrança na Receita Federal"}. Fonte da leitura: ${declaration.reference}.${declaration.note ? ` ${declaration.note}` : ""} Leitura feita sem procuração, em documento do contribuinte; não substitui a Situação Fiscal coletada pelo sistema.`, declaration.hasDebts ? "red" : "gold")] : []),
      h("2. Composição do débito"), t(["Componente PGFN", "Valor", "% do total"], [...m.composition.map((v, i) => [compNames[i], money(v), percent(v !== null && debtTotal ? v / debtTotal * 100 : null)]), ["TOTAL CONSOLIDADO", money(debtTotal), debtTotal ? "100,00%" : "Não informado"]]),
      p("A base potencial de redução é composta pelos acréscimos elegíveis. O principal permanece preservado no cálculo. Componentes ausentes impedem a simulação da inscrição correspondente."),
      h("3. Composição por natureza, tributo e período"),
      t(["Natureza", "Inscrições", "Valor", "% do total"], aggregate(d => /simples/i.test(d.tax) ? "Simples Nacional" : "Tributária")),
    ] },
    { title: "PARTE I - DETALHAMENTO", subtitle: "Todas as inscrições, pendências na Receita Federal e referências", blocks: [
      h("3.1. Distribuição por tributo"), t(["Tributo", "Inscrições", "Valor", "% PGFN"], aggregate(d => d.tax)),
      h("3.2. Distribuição temporal"), t(["Período do débito", "Inscrições", "Valor", "% PGFN"], aggregate(d => d.period)),
      p("Período de apuração e data da inscrição são campos distintos. A revisão de cada crédito depende dos fatos geradores, declarações, constituição e atos de cobrança, sem concluir decadência ou prescrição somente pelo ano."),
      h("4. Detalhamento - composição de cada inscrição"),
      t(["Inscrição / data", "Tributo", "Principal", "M + J + E", "Total"], m.simulation.map(({ debt: d }) => [ `${d.id}\n${d.registeredAt ?? "Data não informada"}`, d.tax, money(d.principal), money([d.fine, d.interest, d.charges].every(v => v !== null) ? d.fine! + d.interest! + d.charges! : null), money(d.total) ])),

    ] },
    { title: "PARTE II - A TRANSAÇÃO", subtitle: "Classificação, metodologia de cálculo e condições do cenário", blocks: [
      h("5. Capacidade de pagamento e rating"), t(["Métrica", "Valor / informação"], [
        ["Capacidade em 60 meses", money(report.capag.amount)], ["Passivo na base CAPAG", money(capagBasis)], ["Passivo federal deste levantamento", money(m.totals.total)], ["Cobertura da base CAPAG", percent(report.capag.amount !== null && capagBasis ? report.capag.amount / capagBasis * 100 : null)], ["Classificação atual", report.capag.rating ?? "Não informada"], ["Classificação-alvo", s?.targetRating ?? "Não definida"],
      ]), p(o?.capagBasisNote ?? unknown), call("Classificação e benefício não são equivalentes", report.capag.note, "red"),
      h("5.1. Revisão da CAPAG e documentação de suporte"), p(o?.capagReview ?? unknown),
      h("6. Metodologia de cálculo do desconto"), p(s ? `Para cada inscrição completa: (i) somar multa, juros e encargo; (ii) aplicar ${percent(s.chargesDiscountBps / 100)} sobre esses acréscimos; (iii) comparar com ${percent(s.totalDiscountCapBps / 100)} do valor total; (iv) utilizar o menor valor, sem atingir o principal; (v) deduzir a redução do consolidado. Os limites são parâmetros deste cenário e não regras universais.` : "A metodologia de simulação aguarda a definição de modalidade, limites e componentes elegíveis."),
      call("Premissa de aplicação", s?.evidence ?? unknown),
      p(`Na hipótese apresentada, o abatimento total é ${money(m.discount)} (${percent(m.savingPercent)} do passivo PGFN). O saldo nominal resultante é ${money(m.final)}. A Receita Federal não integra esse desconto.`),
    ] },
    { title: "PARTE II - SIMULAÇÃO E JANELA", subtitle: "Resultado por inscrição e alternativas de encaminhamento", blocks: [
      h("7. Simulação de desconto - inscrição por inscrição"),
      t(["Inscrição / tributo", "Valor total", "Desconto", "Valor final", "%"], [...m.simulation.map(({ debt: d, discount, final }) => [`${d.id}\n${d.tax}`, money(d.total), money(discount), money(final), percent(discount !== null && d.total ? discount / d.total * 100 : null)]), ["TOTAL PGFN", money(debtTotal), money(m.discount), money(m.final), percent(m.savingPercent)]]),
      call("Leitura do quadro", `A economia potencial corresponde à soma dos descontos por inscrição, preservando o principal. ${s?.status === "illustrative" ? "Cenário ilustrativo, sem benefício aprovado." : "Confirmar a elegibilidade e as condições documentadas antes da adesão."}`, "green"),
      h("8. Janela de adesão"), t(["Elemento", "Situação"], [["Encerramento", shortDate(o?.deadline ?? null)], ["Liberação para adesão", shortDate(o?.releaseDate ?? null)], ["Modalidade, porte e corte de inscrição", "A confirmar na documentação aplicável"]]), p(o?.windowNote ?? unknown),

    ] },
    { title: "PARTE II - CONDIÇÕES DE PAGAMENTO", subtitle: "Variantes de prazo e fluxo nominal por fase", blocks: [
      h("8.1. Alternativas a avaliar"), t(["Alternativa", "Condição para análise"], [["Revisar eventual impedimento", "Confirmar datas, natureza do acordo e fundamento do bloqueio."], ["Avaliar edital disponível", "Verificar critérios de elegibilidade, prazo e custo efetivo."], ["Avaliar negociação individual", "Confirmar cabimento, documentação e capacidade econômica."], ["Avaliar parcelamento convencional", "Comparar desembolso e efeitos na regularidade fiscal."]]),
      h("9. Condições de pagamento - variantes de prazo"),
      p("O modelo de referência apresenta mais de uma combinação de entrada e saldo. Os prazos abaixo são hipóteses comparativas: o porte, a natureza do crédito, a modalidade e a aprovação determinam o enquadramento real."),
      t(["Cenário", "Entrada", "Saldo", "Prazo total"], s && m.entry && m.balance ? [
        ["Hipótese principal", installmentText(m.entry), installmentText(m.balance), `${s.entryMonths + s.balanceMonths} meses`],
        ["Hipótese alternativa", installmentText(installments(m.entry.total, s.alternativeEntryMonths)), installmentText(installments(m.balance.total, s.alternativeBalanceMonths)), `${s.alternativeEntryMonths + s.alternativeBalanceMonths} meses`],
      ] : [["Pendente", "Não simulado", "Não simulado", "Não definido"]]),
      h("9.1. Quadro por categoria"), t(["Categoria", "Original", "Após desconto", "Entrada", "Saldo"], [["Inscrições incluídas na simulação", money(debtTotal), money(m.final), money(m.entry?.total ?? null), money(m.balance?.total ?? null)], ["Débitos RFB (fora da simulação)", money(m.totals.rfb), "Não simulado", "Não simulado", "Não simulado"]]),
      p("Este levantamento não confirma enquadramento previdenciário específico. Quando houver créditos com limites de prazo próprios, eles devem ser separados e simulados em planos compatíveis; não se estende automaticamente o prazo geral a todas as naturezas."),
      h("9.2. Fluxo nominal por fase"), t(["Fase", "Período", "Parcela e ajuste final"], scheduleRows),
      call("Critério de decisão", "Comparar a parcela com o caixa disponível após obrigações operacionais. Prazo longo e redução nominal não comprovam sustentabilidade. A entrada integra o valor final, não é acrescentada novamente ao total.", "green"),
    ] },
    { title: "PARTE III - A VIA DE URGÊNCIA", subtitle: "Certidão e penhora de faturamento", blocks: [
      h("10. O problema da certidão"), p(o?.certificateNote ?? unknown),
      h("11. Penhora de faturamento - análise do instrumento"), p(o?.judicialNote ?? unknown),
      p("A avaliação deve identificar processos, garantias atuais, movimentações, caixa disponível e efeitos da medida pretendida. A proposta depende da análise jurídica do caso e da decisão competente. Não basta indicar um percentual de faturamento para concluir que o crédito esteja integralmente garantido."),
      call("O que este parecer não promete", "O quadro abaixo dimensiona valores mensais. Ele não equivale a uma garantia aceita, não confirma suspensão de exigibilidade e não assegura emissão automática de certidão.", "red"),
      h("12. Dimensionamento do percentual"), p(`Receita anual de referência: ${money(o?.annualRevenue ?? null)}. Período: ${o?.revenuePeriod ?? "Não informado"}. Média mensal: ${money(m.monthlyRevenue)}. A projeção não substitui o faturamento atual.`),
      t(["% do faturamento", "Valor mensal", "Cobertura PGFN*", "Leitura"], [1, 2, 3, 5].map(rate => {
        const amount = m.monthlyRevenue === null ? null : applyRate(m.monthlyRevenue, rate * 100);
        return [`${rate}%`, money(amount), amount && debtTotal !== null ? `${Math.ceil(debtTotal / amount)} meses` : "Não calculada", "Hipótese para análise do caixa"];
      })),
      p("*Cobertura aritmética do passivo PGFN sem atualização, sem abatimentos de outros pagamentos e sem considerar a extensão específica de cada execução. Não constitui prazo judicial de amortização."),
      h("12.1. Documentos para a frente judicial"), p("Autos e decisões atualizados; relação das inscrições abrangidas; garantias já constituídas; demonstrativo de faturamento e margem; compromissos financeiros e plano de acompanhamento do caixa."),
    ] },
    { title: "PARTE III - EFEITO COMBINADO NO CAIXA", subtitle: "Custo mensal, redução do passivo e regularidade fiscal", blocks: [
      h("13. Efeito combinado no caixa"), t(["Cenário", "Desembolso mensal", "Redução nominal", "Certidão"], [
        ["Sem regularização", "Sem parcela nesta hipótese", "Não há redução simulada", "Situação não comprovada"],
        ["Convencional", money(m.conventional?.regular ?? null), "Sem desconto no comparador", "Depende da formalização e demais pendências"],
        ["Percentual do faturamento (2% a 3%)", m.monthlyRevenue === null ? "Não calculado" : `${money(applyRate(m.monthlyRevenue, 200))} a ${money(applyRate(m.monthlyRevenue, 300))}`, "Depende da destinação e amortização", "Sem garantia de emissão"],
        ["Transação - fase de entrada", money(m.entry?.regular ?? null), `Potencial ${money(m.discount)}`, "Depende de requisitos e formalização"],
        ["Transação - fase de saldo", money(m.balance?.regular ?? null), "Mesma hipótese de desconto", "Depende da situação global"],
      ]),
      call("Leitura conjunta", "A frente de regularidade e a frente de negociação devem ser coordenadas. Se houver pagamentos simultâneos, conciliar a destinação e o abatimento para evitar dupla contagem. Valores projetados aqui não são somados automaticamente como obrigações cumulativas.", "green"),
      h("Referências processuais do levantamento"), t(["Inscrição", "Processo administrativo", "Referência judicial", "Situação"], m.debts.map(d => [d.id, d.administrativeProcess ?? "Não informado", d.judicialProcess ?? "Não informada", d.status])),
    ] },
    { title: "PARTE IV - RECOMENDAÇÕES E FECHAMENTO", subtitle: "Ordem de execução, fundamentos e ressalvas", blocks: [
      h("14. Recomendações (ordem de execução)"), t(["Ordem", "Providência", "Momento"], (o?.actions ?? report.recommendations.map(action => ({ action, timing: "A definir" }))).map((a, i) => [String(i + 1).padStart(2, "0"), a.action, a.timing])),
      h("15. Fundamentação jurídica"), ...(o?.legalBasis.length ? o.legalBasis.map(l => p(`${l.title}: ${l.application}\nSituação: ${l.status}.`)) : [p("Normas e referências ainda não informadas. Inserir a fonte, a versão aplicável e a análise de pertinência ao caso antes da emissão definitiva.")]),
      h("16. Ressalvas"), ...(o?.caveats ?? report.pending).map(v => p(`- ${v}`)),
    ] },
    { title: "PARTE IV - CONCLUSÃO", subtitle: "Síntese técnica, evidências e emissão", blocks: [
      h("17. Conclusão"), p(o?.conclusion ?? report.conclusion),
      h("Fontes e rastreabilidade"), ...report.sources.map(source => p(`${source.id.toUpperCase()} · ${source.title}\n${source.provider} · ${source.status} · ${source.status === "pendente" ? "Coleta pendente" : shortDate(source.collectedAt)}. ${source.note}`)),
      ...(report.annexes?.length ? [h("Anexos deste parecer"), t(["Documento", "Tipo", "Data", "SHA-256"], report.annexes.map(a => [a.name, a.type, shortDate(a.createdAt), `${a.sha256.slice(0, 16)}…`])), p("Os anexos são os arquivos originais do acervo da empresa, sem alteração. A versão \"parecer com anexos\" reúne este documento e os arquivos acima.")] : []),
      h("Documentos pendentes para emissão definitiva"), ...report.pending.map(v => p(`- ${v}`)),
      call("Responsabilidade pela emissão", report.mode === "demo" ? "Versão demonstrativa para validar o padrão visual e os cálculos. Nenhuma consulta real foi realizada. Não há assinatura ou parecer profissional emitido nesta versão." : "Documento preparado para revisão. Registrar responsável técnico, evidências e aprovação antes da emissão definitiva."),
      p(`Goiânia, ${shortDate(report.generatedAt)}.\nFS Soluções Tributárias · Assessoria tributária e planejamento fiscal\n${report.id} · Versão ${report.version}`),
    ] },
  ];
  for (const supplement of report.supplements ?? []) {
    pages.push({ title: "EVIDÊNCIAS COMPLEMENTARES", subtitle: supplement.title, blocks: [p(supplement.note), t(supplement.headers, supplement.rows)] });
  }
  return { report, metrics: m, pages };
}
