import { formatCnpj, money, validateReport, type Debt, type DiagnosticReport } from "./model";
import { applyRate, installments, shortDate } from "./opinion";
import { intelligence, natureLabels, natureOf, share, stageLabels, stageOf, type Intelligence } from "./inteligencia";

// Conteúdo do Diagnóstico Fiscal Estratégico e do Resumo (padrão VOX): só o que as fontes coletadas sustentam.
// Cálculos em centavos; "a apurar" quando falta fonte (nunca zero no lugar de dado ausente).
// Encontro de contas com crédito judicial não é proposto automaticamente: é decisão da equipe.

export type Tone = "red" | "gold" | "green" | "ink";
export type Kpi = { label: string; value: string; detail: string; tone: Tone; highlight?: boolean };
export type Block = { title: string; text: string; tone: "red" | "green" | "gold" | "gray" };
export type MapRow = { orgao: string; tributo: string; compet: string; ref: string; valor: string; situacao: string; certidao: "Impede" | "Impedirá" | "Não impede" | "A confirmar"; tratamento: string };
export type MapGroup = { title: string; rows: MapRow[]; subtotal: string | null };

const PREV = new Set(["previdenciaria", "descontados"]);
// Nomes curtos para quadros e frentes.
export const natureShort: Record<string, string> = { previdenciaria: "INSS patronal", descontados: "INSS dos segurados", terceiros: "Terceiros", corporativos: "IRPJ, CSLL, PIS e COFINS", retidos: "IRRF e retenções", multa: "Multas acessórias", simples: "Simples Nacional", outros: "Outros" };
const TETO_BPS = 6500, ENTRADA_BPS = 600, ENTRADA_MESES = 6, PRAZO_GERAL = 120, PRAZO_PREV = 60;
const sum = (list: Debt[]) => list.reduce((acc, d) => acc + d.total, 0);
const dueOf = (d: Debt) => d.status.match(/vencimento (\d{2}\/\d{2}\/\d{4})/)?.[1] ?? null;
const notesOf = (d: Debt) => d.status.split(" · ").slice(2).join(" · ");

export function certificateInfo(report: DiagnosticReport) {
  const note = report.opinion?.certificateNote ?? "";
  const kind = /certidão negativa:/i.test(note) ? "Certidão Negativa de Débitos (CND)" : /positiva com efeitos de negativa/i.test(note) ? "Certidão Positiva com Efeitos de Negativa (CPEN)" : null;
  const code = note.match(/:\s*([0-9A-F]{4}\.[0-9A-F]{4}\.[0-9A-F]{4}\.[0-9A-F]{4})/i)?.[1] ?? null;
  return { kind, code, issued: note.match(/Emissão:\s*(\d{2}\/\d{2}\/\d{4})/)?.[1] ?? null, valid: note.match(/Data de Validade:\s*(\d{2}\/\d{2}\/\d{4})/)?.[1] ?? null };
}

// Transação na PGFN pelo teto legal: só com CAPAG C ou D e composição (principal, multa, juros, encargo) de cada inscrição.
export function transactionCeiling(report: DiagnosticReport) {
  const rating = report.capag.rating?.trim().toUpperCase().slice(0, 1) ?? null;
  const open = report.debts.filter(d => d.origin === "PGFN" && !["negociada", "suspensa"].includes(stageOf(d.status)));
  const complete = open.length > 0 && open.every(d => [d.principal, d.fine, d.interest, d.charges].every(v => v !== null));
  if (!rating || !complete) return { rating, available: false as const, reason: !rating ? "CAPAG e rating não recebidos (Regularize/SISPAR)." : "Composição por inscrição (principal, multa, juros e encargo) não recebida (Regularize)." };
  const discounted = rating === "C" || rating === "D";
  const rows = open.map(d => {
    const accessories = d.fine! + d.interest! + d.charges!, discount = discounted ? Math.min(accessories, applyRate(d.total, TETO_BPS)) : 0;
    return { debt: d, prev: PREV.has(natureOf(d.tax).nature), principal: d.principal!, discount, final: d.total - discount };
  });
  const total = rows.reduce((a, r) => a + r.debt.total, 0), discount = rows.reduce((a, r) => a + r.discount, 0), final = total - discount;
  const entry = Math.min(applyRate(total, ENTRADA_BPS), final);
  // Saldo dividido em proporção ao valor final de cada grupo; previdenciárias até 60 meses, demais até 120 (premissa do edital).
  const prevFinal = rows.filter(r => r.prev).reduce((a, r) => a + r.final, 0), restFinal = final - prevFinal;
  const prevEntry = final ? Math.round(entry * prevFinal / final) : 0, restEntry = entry - prevEntry;
  const prevPlan = prevFinal - prevEntry > 0 ? installments(prevFinal - prevEntry, PRAZO_PREV - ENTRADA_MESES) : null;
  const restPlan = restFinal - restEntry > 0 ? installments(restFinal - restEntry, PRAZO_GERAL - ENTRADA_MESES) : null;
  return { rating, available: true as const, discounted, rows, total, discount, final, entry, entryPlan: entry > 0 ? installments(entry, ENTRADA_MESES) : null, prevPlan, restPlan };
}

export function strategicModel(input: DiagnosticReport) {
  const report = validateReport(input), ix: Intelligence = intelligence(report), cert = certificateInfo(report);
  const base = new Date(report.generatedAt), baseBr = shortDate(report.generatedAt);
  const rfb = report.debts.filter(d => d.origin === "RFB"), pgfn = report.debts.filter(d => d.origin === "PGFN");
  const rfbSource = report.sources.find(s => s.id === "rfb"), pgfnSource = report.sources.find(s => s.id === "pgfn");
  const rfbKnown = rfbSource?.status === "coletado" || rfbSource?.status === "declarado" || rfbSource?.status === "demonstrativo";
  const negotiated = pgfn.filter(d => ["negociada", "suspensa"].includes(stageOf(d.status))), pgfnOpen = pgfn.filter(d => !negotiated.includes(d));
  const total = ix.rfbTotal + ix.pgfnTotal, tx = transactionCeiling(report);
  const suspendedRows = report.supplements?.find(s => s.title.startsWith("Receita Federal - registros fora"))?.rows ?? [];
  const sitfisRows = report.supplements?.filter(s => s.title.startsWith("SITFIS")).flatMap(s => s.rows) ?? [];
  const installmentsRows = sitfisRows.filter(r => /^(Parcelamento|Pendência - Parcelamento)/.test(r[0] ?? ""));
  const rfbFines = rfb.filter(d => natureOf(d.tax).nature === "multa"), rfbTaxes = rfb.filter(d => natureOf(d.tax).nature !== "multa");
  const withheld = rfbTaxes.filter(d => ["retidos", "descontados"].includes(natureOf(d.tax).nature));
  const late = ix.lateInstallments.filter(l => l.parcels), pendingWithoutValue = ix.divida.length + ix.fiscalProcesses.length;
  const validDate = cert.valid ? new Date(cert.valid.split("/").reverse().join("-") + "T23:59:59-03:00") : null;
  const certValid = validDate ? validDate >= base : null;
  const impeding = rfb.length + pgfnOpen.length + late.length + ix.omissions.length + pendingWithoutValue > 0;

  // ---------- Desembolso inicial (1º mês) ----------
  const rfbPlan = ix.ordinary.rfb.plan, rfbOutside = ix.ordinary.rfb.excluded;
  const pgfnFirst = tx.available && tx.entryPlan ? tx.entryPlan.regular : null;
  const firstMonth = (rfbKnown ? (rfbPlan?.regular ?? 0) + rfbOutside : 0) + (pgfnOpen.length ? (pgfnFirst ?? 0) : 0);
  // Parcelas em atraso não têm valor no relatório: sem elas o desembolso do 1º mês fica "a apurar".
  const firstMonthKnown = (pgfnOpen.length === 0 || pgfnFirst !== null) && late.length === 0;

  // ---------- Resumo: indicadores ----------
  const certValue = cert.valid ? `${certValid ? "Vence" : "Venceu"} ${cert.valid}` : "Não identificada";
  const summaryKpis: Kpi[] = [
    { label: "Quanto a empresa deve", value: money(total), detail: `Receita ${rfbKnown ? money(ix.rfbTotal) : "pendente"} · PGFN ${money(ix.pgfnTotal)}`, tone: "red" },
    ix.execution.count ? { label: "Em execução fiscal", value: `${ix.execution.count} · ${money(ix.execution.total)}`, detail: ix.filing.count ? `mais ${ix.filing.count} a ser ajuizadas (${money(ix.filing.total)})` : "inscrições ajuizadas na PGFN", tone: "red" }
      : { label: "Dívida ativa em cobrança", value: money(sum(pgfnOpen)), detail: negotiated.length ? `${negotiated.length} inscrições já negociadas (${money(sum(negotiated))})` : `${pgfnOpen.length} inscrições`, tone: pgfnOpen.length ? "red" : "ink" },
    { label: "Certidão atual", value: cert.kind ? certValue : "Não identificada", detail: cert.kind ? `${cert.kind.match(/\((\w+)\)/)?.[1] ?? ""}${impeding ? " · hoje não seria renovada" : ""}` : "conferir no e-CAC", tone: "ink" },
    { label: "Desembolso no 1º mês (estimado)", value: firstMonthKnown ? money(firstMonth) : "A apurar", detail: firstMonthKnown ? "parcelas e pagamentos à vista do plano" : late.length ? "parcelas em atraso sem valor no relatório" : "depende da transação na PGFN (Regularize)", tone: "gold", highlight: true },
    { label: "Redução possível na PGFN", value: tx.available ? (tx.discounted ? `até ${money(tx.discount)}` : "Sem desconto") : pgfnOpen.length ? "A apurar" : money(0), detail: tx.available ? (tx.discounted ? `teto legal · rating ${tx.rating}` : `rating ${tx.rating}: sem redução`) : pgfnOpen.length ? "falta CAPAG e composição (Regularize)" : "nada em cobrança na PGFN", tone: "green" },
    { label: "Fora do parcelamento comum", value: money(ix.openOutside.reduce((a, x) => a + x.total, 0)), detail: ix.openOutside.length ? "retidos e descontados: fora do parcelamento ordinário" : "nenhum valor nessa condição", tone: ix.openOutside.length ? "red" : "ink" },
  ];

  // ---------- Frentes ----------
  const fronts: { name: string; sub: string; owed: string; solution: string; outlay: string; economy: string }[] = [];
  if (rfbTaxes.length) fronts.push({ name: "Receita Federal", sub: [...new Set(rfbTaxes.map(d => natureShort[natureOf(d.tax).nature]))].join(", "), owed: money(sum(rfbTaxes)),
    solution: `Parcelamento ordinário em até 60 parcelas${withheld.length ? `; retidos e descontados (${money(sum(withheld))}) pagos à vista, pois não entram no parcelamento` : ""}`,
    outlay: `${rfbPlan ? `1ª parcela ${money(rfbPlan.regular)}` : "—"}${rfbOutside ? ` + ${money(rfbOutside)} à vista` : ""}`, economy: money(0) });
  if (pgfnOpen.length) fronts.push({ name: "PGFN", sub: `${pgfnOpen.length} inscrições em cobrança`, owed: money(sum(pgfnOpen)),
    solution: tx.available ? (tx.discounted ? `Transação (rating ${tx.rating}): reduz multa, juros e encargo até o teto legal; saldo parcelado` : `Rating ${tx.rating}: transação sem desconto ou parcelamento ordinário`) : "Transação ou parcelamento: definido pela CAPAG e pela composição das inscrições (Regularize)",
    outlay: tx.available && tx.entryPlan ? `Entrada ${money(tx.entry)} em ${ENTRADA_MESES} meses (premissa)` : "A apurar", economy: tx.available ? (tx.discounted ? `até ${money(tx.discount)}` : money(0)) : "A apurar" });
  if (negotiated.length) fronts.push({ name: "Acordos em curso", sub: "PGFN negociada", owed: money(sum(negotiated)), solution: "Manter as parcelas em dia; atraso leva à rescisão e a cobrança volta com o saldo", outlay: "Parcelas vigentes", economy: "—" });
  if (rfbFines.length || late.length || ix.omissions.length) fronts.push({ name: "Pequenas pendências", sub: [rfbFines.length ? "multas acessórias" : "", late.length ? "parcelas em atraso" : "", ix.omissions.length ? "declarações" : ""].filter(Boolean).join(", "),
    owed: [rfbFines.length ? money(sum(rfbFines)) : "", late.length ? `parcelas ${late.map(l => l.system).join(", ")}` : "", ix.omissions.length ? "declarações" : ""].filter(Boolean).join(" + "), solution: [rfbFines.length ? "pagar as multas" : "", late.length ? `quitar ${late.reduce((a, l) => a + l.parcels, 0)} parcelas em atraso` : "", ix.omissions.length ? "entregar as declarações omitidas" : ""].filter(Boolean).join("; ").replace(/^./, c => c.toUpperCase()), outlay: [rfbFines.length ? money(sum(rfbFines)) : "", late.length ? "parcelas em atraso (a apurar)" : ""].filter(Boolean).join(" + ") || "—", economy: money(0) });
  if (pendingWithoutValue) fronts.push({ name: "Itens sem valor na fonte", sub: "levantamento", owed: "A apurar", solution: [ix.divida.length ? `${ix.divida.length} inscrições previdenciárias (sistema DIVIDA)` : "", ix.fiscalProcesses.length ? `${ix.fiscalProcesses.length} processos fiscais devedores` : ""].filter(Boolean).join(" e ") + ": levantar valores no Regularize/e-CAC", outlay: "A apurar", economy: "—" });

  // ---------- O que falta para regularizar (passos) ----------
  const steps: [string, string][] = [];
  if (rfbOutside) steps.push(["Pagar os tributos retidos e descontados", ` (${money(rfbOutside)}) em DARF próprio: não entram no parcelamento e têm prioridade.`]);
  if (rfbTaxes.length) steps.push(["Parcelar a Receita Federal", ` (${money(sum(rfbTaxes) - rfbOutside)}) em até 60 parcelas e pagar a 1ª parcela.`]);
  if (late.length) steps.push(["Quitar as parcelas em atraso", ` (${late.map(l => `${l.system}: ${l.parcels}`).join("; ")}) para evitar a rescisão.`]);
  if (ix.omissions.length) steps.push(["Entregar as declarações omitidas", ` (${ix.omissions.join("; ")}).`]);
  if (pgfnOpen.length) steps.push(tx.available ? ["Fechar a negociação na PGFN", ` das ${pgfnOpen.length} inscrições em cobrança e pagar a 1ª parcela da entrada.`] : ["Extrair a CAPAG e a composição no Regularize", " para definir a transação das inscrições em cobrança."]);
  if (ix.execution.count) steps.push(["Proteger o caixa nas execuções", ` (${ix.execution.count} inscrições): garantir ou formalizar o acordo antes de penhora.`]);
  if (pendingWithoutValue) steps.push(["Levantar os itens sem valor", " (DIVIDA e processos fiscais) antes de fechar a estratégia."]);
  if (rfbFines.length) steps.push(["Pagar as multas de obrigação acessória", ` (${money(sum(rfbFines))}) e manter em dia os tributos do mês.`]);
  steps.push(["Emitir a certidão (CPEN)", `, que tem o mesmo efeito da negativa.${cert.valid && certValid ? ` Meta: antes de ${cert.valid}.` : ""}`]);

  const who: [string, string][] = [
    ["FS Soluções Tributárias", `Análise, ${pgfnOpen.length ? "proposta de transação na PGFN, " : ""}${ix.execution.count ? "acompanhamento das execuções, " : ""}pedidos de parcelamento e emissão da certidão`],
    ["Empresa", "Procurações (e-CAC e Regularize), balanço, DRE e faturamento dos últimos 12 meses, pagamento das entradas e das parcelas"],
    ["Contabilidade", `Guias dos tributos correntes${rfbOutside ? ", DARF dos retidos e descontados" : ""}${late.length ? ", parcelas em atraso" : ""}${ix.omissions.length ? ", entrega das declarações omitidas" : ""}`],
  ];

  // ---------- Painel executivo ----------
  const panelKpis: Kpi[] = [
    { label: "Quanto a empresa deve", value: money(total), detail: `PGFN ${money(ix.pgfnTotal)} + Receita ${rfbKnown ? money(ix.rfbTotal) : "pendente"}`, tone: "red" },
    { label: "Receita Federal", value: rfbKnown ? money(ix.rfbTotal) : "Pendente", detail: rfbKnown ? `${rfb.length} débitos em cobrança${suspendedRows.length ? ` · ${suspendedRows.length} a vencer/suspensos` : ""}` : "Situação Fiscal não coletada", tone: "ink" },
    { label: "Inscrito na PGFN", value: money(ix.pgfnTotal), detail: `${money(sum(pgfnOpen))} em cobrança${negotiated.length ? ` + ${money(sum(negotiated))} negociados` : ""}`, tone: "ink" },
    { label: "Em execução fiscal", value: ix.execution.count ? `${ix.execution.count} · ${money(ix.execution.total)}` : "Nenhuma", detail: ix.execution.count ? `${ix.execution.guaranteed} com garantia${ix.filing.count ? ` · ${ix.filing.count} a ser ajuizadas` : ""}` : ix.filing.count ? `${ix.filing.count} a ser ajuizadas (${money(ix.filing.total)})` : "sem ajuizamento informado", tone: ix.execution.count ? "red" : "ink" },
    { label: "Última certidão apresentada", value: cert.kind ? `${cert.kind.match(/\((\w+)\)/)?.[1]} · ${cert.valid ?? "?"}` : "Não identificada", detail: cert.kind ? `${cert.issued ? `Emitida em ${cert.issued}` : ""}${certValid === false ? " · vencida" : impeding ? " · nova emissão hoje: impedida" : ""}` : "conferir no e-CAC", tone: certValid === false ? "red" : "ink" },
    { label: "Parcelado ou suspenso", value: money(sum(negotiated)), detail: `${negotiated.length} inscrições PGFN${installmentsRows.length ? ` · ${installmentsRows.length} registros de parcelamento na Receita` : ""}`, tone: "ink" },
    { label: "Desembolso no 1º mês", value: firstMonthKnown ? money(firstMonth) : "A apurar", detail: firstMonthKnown ? "estimativa do plano recomendado" : late.length ? "parcelas em atraso sem valor no relatório" : "depende da CAPAG (Regularize)", tone: "gold", highlight: true },
    { label: "Redução máxima na PGFN", value: tx.available ? money(tx.discount) : pgfnOpen.length ? "A apurar" : money(0), detail: tx.available ? (tx.discounted ? `teto legal (${share(tx.discount, tx.total)}); rating ${tx.rating}` : `rating ${tx.rating}: sem desconto`) : "CAPAG e composição pendentes", tone: "green" },
  ];
  const obstacles = [
    rfbTaxes.length ? `${money(sum(rfbTaxes))} vencidos na Receita Federal (${[...new Set(rfbTaxes.map(d => natureShort[natureOf(d.tax).nature]))].join(", ")}).` : "",
    pgfnOpen.length ? `${pgfnOpen.length} inscrições em cobrança na PGFN (${money(sum(pgfnOpen))})${ix.execution.count ? `, ${ix.execution.count} em execução fiscal` : ""}.` : "",
    late.length ? `Parcelas em atraso: ${late.map(l => `${l.system} (${l.parcels})`).join("; ")}.` : "",
    ix.omissions.length ? `Declaração omitida: ${ix.omissions.join("; ")}.` : "",
    pendingWithoutValue ? `${pendingWithoutValue} itens sem valor no relatório (DIVIDA e processos fiscais).` : "",
  ].filter(Boolean);
  const sequence = `${report.company.name} ${cert.kind ? (certValid ? `tem ${cert.kind.match(/\((\w+)\)/)?.[1]} válida até ${cert.valid}` : `teve a última certidão vencida em ${cert.valid}`) : rfbKnown ? "não tem certidão identificada no relatório da Receita" : "não teve a certidão conferida (Receita Federal não consultada)"}${impeding ? ", e hoje uma nova emissão seria negada" : ""}. ${steps.slice(0, -1).map(([a, b]) => `${a}${b}`).join(" ")} Cumpridos esses eventos, a certidão cabível é a Positiva com Efeitos de Negativa (CPEN).`;

  // ---------- Seção 1: documentos ----------
  const documents = [
    ...(rfbSource && rfbSource.status !== "pendente" ? [["Relatório de Situação Fiscal (Informações de Apoio para Emissão de Certidão), RFB/PGFN", shortDate(rfbSource.collectedAt), "Cadastro, última certidão, débitos SIEF, parcelamentos, processos e inscrições SIDA"]] : []),
    ...(pgfnSource ? [["Consulta de inscrições em dívida ativa (PGFN)", shortDate(pgfnSource.collectedAt), `${pgfn.length} inscrições ativas, situação e processo de cada uma`]] : []),
    ...(report.capag.rating || report.capag.amount ? [["Regularize/SISPAR: Capacidade de Pagamento", baseBr, `CAPAG ${money(report.capag.amount)}, rating ${report.capag.rating ?? "não informado"}`]] : []),
    ...(report.annexes ?? []).filter(a => !/Situacao Fiscal/i.test(a.name)).map(a => [a.name, shortDate(a.createdAt), a.type]),
  ];
  const criteria = "Critérios adotados. Comprovado: número extraído literalmente de documento oficial. Simulação: aplicação de regra legal a número comprovado. Pendente de confirmação: dado ausente nos anexos, com a indicação do documento que o supre. Débitos que aparecem em mais de um documento foram contados uma vez. Valores na data-base, sujeitos a atualização pela Selic.";

  // ---------- Seção 2: certidão ----------
  const certRows: [string, string][] = cert.kind ? [["Tipo de certidão", cert.kind], ["Data de emissão", cert.issued ?? "Não informada"], ["Data de validade", cert.valid ?? "Não informada"], ["Código de controle", cert.code ?? "Não informado"], ["Situação atual", certValid === false ? `Vencida. Uma nova emissão, em ${baseBr}, ${impeding ? "seria negada pelas pendências da seção 3" : "depende de conferência no e-CAC"}.` : `Dentro do prazo de validade.${impeding ? ` Uma nova emissão, em ${baseBr}, seria negada pelas pendências da seção 3.` : ""}`], ["Fonte", `Relatório de Situação Fiscal, bloco "Certidão Emitida", ${baseBr}`]] : [];
  const possible = negotiated.length || installmentsRows.length || pgfnOpen.length || rfb.length ? "CPEN" : "CND";

  // ---------- Seção 3: mapa ----------
  const rfbTreatment = (d: Debt) => { const n = natureOf(d.tax).nature; return n === "retidos" || n === "descontados" ? "Prioridade 1: DARF à vista (fora do parcelamento)" : n === "multa" ? "Pagamento ou parcelamento" : n === "simples" ? "Parcelamento do Simples (LC 123)" : "Parcelamento ordinário (até 60x) ou pagamento"; };
  const groupA: MapRow[] = rfb.map(d => ({ orgao: "RFB", tributo: d.tax.replace(/^\d{4}-\d{2}\s*-\s*/, "") + ` (${d.tax.slice(0, 4)})`, compet: d.period, ref: notesOf(d) || "SIEF", valor: money(d.total), situacao: `Devedor${dueOf(d) ? `, vencido em ${dueOf(d)}` : ""}`, certidao: "Impede", tratamento: rfbTreatment(d) }));
  const groupB: MapRow[] = suspendedRows.map(r => { const due = r[1] ?? "", dueDate = due ? new Date(due.split("/").reverse().join("-") + "T23:59:59-03:00") : null; const passed = dueDate ? dueDate < base : false; return { orgao: "RFB", tributo: (r[0] ?? "").split(" · ")[0]!, compet: (r[0] ?? "").split(" · ")[1] ?? "", ref: "SIEF", valor: r[3] ?? "", situacao: `${(r[4] ?? "").split(" · ")[0]}${due ? `; vencimento ${due}` : ""}`, certidao: passed ? "Impedirá" : "Não impede", tratamento: passed ? "Passa a devedor: incluir no plano" : "Pagar no vencimento" }; });
  const groupC: MapRow[] = [
    ...installmentsRows.map(r => { const atraso = Number((r[1] ?? "").match(/Parcelas em atraso\s*·?\s*(\d+)/i)?.[1] ?? 0); return { orgao: /SISPAR|PGFN/.test(r[0] ?? "") ? "PGFN" : "RFB", tributo: (r[0] ?? "").replace(/^Pendência - /, ""), compet: "—", ref: (r[1] ?? "").split(" · ")[0]!.slice(0, 60), valor: (r[1] ?? "").match(/Valor[^:]*:\s*([\d.]+,\d{2})/)?.[1] ? `R$ ${(r[1] ?? "").match(/Valor[^:]*:\s*([\d.]+,\d{2})/)![1]}` : "Pendente de confirmação", situacao: atraso ? `${atraso} parcelas em atraso` : /Pendência/.test(r[0] ?? "") ? "Com pendência" : "Exigibilidade suspensa", certidao: (atraso || /Pendência/.test(r[0] ?? "")) ? "Impede" as const : "Não impede" as const, tratamento: atraso || /Pendência/.test(r[0] ?? "") ? "Quitar as parcelas em atraso" : "Manter em dia" }; }),
    ...negotiated.map(d => ({ orgao: "PGFN", tributo: d.tax, compet: d.registeredAt ? `Inscrita ${d.registeredAt}` : "—", ref: d.id, valor: money(d.total), situacao: stageLabels[stageOf(d.status)], certidao: "Não impede" as const, tratamento: "Manter em dia; não somar às inscrições em cobrança" })),
  ];
  const pgfnTreatment = (d: Debt) => { const st = stageOf(d.status); const deal = tx.available ? (tx.discounted ? "Transação com desconto" : "Transação/parcelamento") : "Transação ou parcelamento (CAPAG)"; return st === "ajuizada" ? `${deal}; garantir para evitar penhora` : st === "ajuizada_garantia" ? `${deal}; garantia mantida` : st === "a_ser_ajuizada" ? `${deal} antes do ajuizamento` : deal; };
  const groupD: MapRow[] = pgfnOpen.map(d => ({ orgao: "PGFN", tributo: d.tax, compet: d.registeredAt ? `Inscrita ${d.registeredAt}` : "—", ref: d.id, valor: money(d.total), situacao: stageLabels[stageOf(d.status)], certidao: stageOf(d.status) === "ajuizada_garantia" ? "A confirmar" : "Impede", tratamento: pgfnTreatment(d) }));
  const groupE: MapRow[] = [
    ...ix.divida.map(d => ({ orgao: "PGFN", tributo: "Contribuição previdenciária (sistema DIVIDA)", compet: "—", ref: d.id, valor: "Sem valor na fonte", situacao: d.situation, certidao: "Impede" as const, tratamento: "Levantar valor no Regularize" })),
    ...ix.fiscalProcesses.map(p => ({ orgao: "RFB", tributo: "Processo fiscal", compet: "—", ref: p, valor: "Sem valor na fonte", situacao: "Devedor", certidao: "Impede" as const, tratamento: "Levantar débitos no e-CAC" })),
    ...ix.omissions.map(o => ({ orgao: "RFB", tributo: "Omissão de declaração", compet: "—", ref: o, valor: "—", situacao: "Omissa", certidao: "Impede" as const, tratamento: "Entregar a declaração" })),
  ];
  const mapGroups: MapGroup[] = [
    { title: "A. Débitos vencidos na Receita Federal", rows: groupA, subtotal: groupA.length ? money(ix.rfbTotal) : null },
    { title: "B. Débitos a vencer e com exigibilidade suspensa", rows: groupB, subtotal: null },
    { title: "C. Parcelamentos e transações existentes", rows: groupC, subtotal: null },
    { title: "D. Inscrições em dívida ativa na PGFN (em cobrança)", rows: groupD, subtotal: groupD.length ? money(sum(pgfnOpen)) : null },
    { title: "E. Pendências sem valor na fonte", rows: groupE, subtotal: null },
  ].filter(g => g.rows.length);
  const impedesList = [groupA.length ? `os débitos do grupo A (${money(ix.rfbTotal)})` : "", groupC.some(r => r.certidao === "Impede") ? "as pendências de parcelamento do grupo C" : "", groupD.length ? `as inscrições do grupo D (${money(sum(pgfnOpen))})` : "", groupE.length ? "os itens do grupo E" : ""].filter(Boolean).join(", ");
  const whatImpedes = `${impedesList ? impedesList.replace(/^./, ch => ch.toUpperCase()) : "Nenhum item"}${groupA.length || groupD.length || groupE.length || groupC.some(r => r.certidao === "Impede") ? " impedem a certidão hoje." : " impede a certidão hoje."}${negotiated.length ? " Não impedem: as inscrições negociadas em dia." : ""}${groupB.some(r => r.certidao === "Impedirá") ? " Os débitos a vencer já vencidos passarão ao grupo A no processamento." : ""}`;

  // ---------- Seção 4: PGFN ----------
  const pgfnStages = ix.stages.map(g => [stageLabels[g.stage], String(g.count), money(g.total), share(g.total, ix.pgfnTotal)]);
  const pgfnTop = ix.ranked.slice(0, 10).map(d => [d.id, d.tax, d.registeredAt ?? "—", stageLabels[stageOf(d.status)], money(d.total)]);
  const executionNote = ix.execution.count ? `Citada na execução, a empresa tem 5 dias para pagar ou garantir (LEF, art. 8º); depois, a penhora começa pelo dinheiro (LEF, art. 11, I). ${ix.execution.guaranteed ? `${ix.execution.guaranteed} ${ix.execution.guaranteed === 1 ? "inscrição já tem" : "inscrições já têm"} garantia.` : "Nenhuma inscrição tem garantia informada."} A fonte não traz os autos: citação, penhoras e bloqueios precisam ser levantados nos processos.` : ix.filing.count ? `${ix.filing.count} inscrições estão "a ser ajuizadas": ainda há janela para negociar ou garantir antes da execução.` : "Nenhuma execução fiscal informada pela PGFN.";

  // ---------- Seção 5: Receita ----------
  const natureRows = ix.natures.filter(n => n.rfbCount).map(n => [natureLabels[n.nature], String(n.rfbCount), money(n.rfbTotal), natureShort[n.nature]!]);
  const o60 = ix.ordinary.rfb;

  // ---------- Seção 6: transação ----------
  const ptotal = sum(pgfnOpen);
  const modality = ptotal === 0 ? "—" : ptotal > 1_000_000_000 ? "Transação individual (acima de R$ 10 milhões)" : ptotal > 100_000_000 ? "Transação individual simplificada (entre R$ 1 milhão e R$ 10 milhões)" : "Transação por adesão (edital vigente, conferir data de corte)";
  const txRows: [string, string][] = [
    ["Capacidade de pagamento (CAPAG)", report.capag.amount !== null ? money(report.capag.amount) : "Pendente (Regularize/SISPAR)"],
    ["Classificação", report.capag.rating ? `${report.capag.rating}${tx.available && tx.discounted ? ": autoriza desconto sobre multa, juros e encargo" : tx.available ? ": sem desconto" : ""}` : "Pendente"],
    ["Inscrições a negociar", `${pgfnOpen.length} inscrições, ${money(ptotal)}`],
    ["Modalidade cabível", modality],
    ["Limites legais", "Desconto de até 65% do total, vedada a redução do principal; prazo de até 120 meses (ME/EPP: 70% e 145 meses); previdenciárias até 60 meses (Lei 13.988/2020, art. 11; CF, art. 195, § 11)"],
  ];

  // ---------- Seção 7: alternativas ----------
  const rfbAlt = rfbTaxes.length ? [
    ["Pagamento integral", money(sum(rfbTaxes)), money(sum(rfbTaxes)), money(sum(rfbTaxes)), money(0), "Um DARF por débito; baixa imediata"],
    ["Parcelamento ordinário (Lei 10.522/2002)", money(sum(rfbTaxes)), `${o60.plan ? `1ª parcela ${money(o60.plan.regular)}` : "—"}${o60.excluded ? ` + ${money(o60.excluded)} à vista` : ""}`, `${money(sum(rfbTaxes))} + Selic`, money(0), "Até 60 parcelas; produz CPEN com a 1ª paga; retidos e descontados ficam de fora"],
  ] : [];
  const pgfnAlt = pgfnOpen.length ? [
    ["Pagamento integral", money(ptotal), money(ptotal), money(ptotal), money(0), "Encerra a cobrança e as execuções"],
    ["Parcelamento ordinário", money(ptotal), `1ª parcela ${money(installments(ptotal, 60).regular)}`, `${money(ptotal)} + Selic`, money(0), "Até 60 parcelas, sem desconto"],
    ["Transação (teto legal)", money(ptotal), tx.available ? `${money(tx.entry)} em ${ENTRADA_MESES} meses` : "A apurar", tx.available ? `${money(tx.final)} + Selic` : "A apurar", tx.available ? (tx.discounted ? `até ${money(tx.discount)}` : money(0)) : "A apurar", tx.available ? `Rating ${tx.rating}; desconto fixado pela PGFN` : "Depende da CAPAG e da composição (Regularize)"],
  ] : [];

  // ---------- Seção 8: o que falta para a certidão ----------
  const certPending: { group: string; rows: string[][] }[] = [
    { group: "a) Receita Federal", rows: [...(rfbOutside ? [["Retidos e descontados", "DARF à vista", "Empresa e contabilidade", money(rfbOutside), "Baixa no SIEF"]] : []), ...(rfbTaxes.length ? [["Débitos SIEF", "Pedido de parcelamento e 1ª parcela", "FS e contabilidade", money(sum(rfbTaxes) - rfbOutside), "Débitos como parcelados no relatório"]] : []), ...(rfbFines.length ? [["Multas acessórias", "Pagamento", "Contabilidade", money(sum(rfbFines)), "Baixa no SIEF"]] : [])] },
    { group: "b) Parcelamentos", rows: late.map(l => [`${l.system}: ${l.parcels} parcelas em atraso`, "Emitir e pagar as parcelas", "Contabilidade", "Pendente de confirmação", "Parcelamento sem atraso"]) },
    { group: "c) PGFN", rows: pgfnOpen.length ? [[`${pgfnOpen.length} inscrições, ${money(ptotal)}`, tx.available ? "Transação e 1ª parcela da entrada" : "CAPAG/composição no Regularize; depois transação", "FS e empresa", tx.available ? money(tx.entryPlan?.regular ?? 0) : "A apurar", "Inscrições negociadas"]] : [] },
    { group: "d) Declarações e itens sem valor", rows: [...ix.omissions.map(o => [o, "Entregar a declaração", "Contabilidade", "—", "Omissão baixada"]), ...ix.divida.map(d => [`DIVIDA ${d.id}`, "Levantar valor e negociar", "FS", "A apurar", "Regularizada"]), ...ix.fiscalProcesses.map(p => [`Processo ${p}`, "Levantar débitos e tratar", "FS", "A apurar", "Fora da condição devedor"])] },
    { group: "e) Emissão", rows: [["Verificação final", "Novo Relatório de Situação Fiscal; emissão da CPEN", "FS", money(0), "CPEN emitida"]] },
  ].filter(g => g.rows.length);

  // ---------- Seção 9: plano ----------
  const plan: string[][] = [
    ...(rfbOutside ? [["1", "Pagar os retidos e descontados em DARF", "Empresa e contabilidade", "Emissão das guias", "Imediato", "Comprovantes"]] : []),
    ...(late.length ? [["1", "Pagar as parcelas em atraso dos parcelamentos", "Contabilidade", "Emissão das guias", "Imediato", "Extratos sem atraso"]] : []),
    ...(pgfnOpen.length && !tx.available ? [["1", "Extrair CAPAG e composição das inscrições no Regularize", "FS", "Procuração no Regularize", "Imediato", "Relatórios anexados"]] : []),
    ...(rfbTaxes.length ? [["2", "Pedir o parcelamento ordinário da Receita", "FS", "Procuração no e-CAC", "Paralelo", "Recibo e 1ª parcela paga"]] : []),
    ...(pgfnOpen.length ? [["2", tx.available ? "Protocolar a transação das inscrições em cobrança" : "Definir a via da PGFN (transação ou parcelamento)", "FS e empresa", tx.available ? "Documentos financeiros" : "CAPAG", "Após o item 1", "Requerimento no Regularize"]] : []),
    ...(ix.execution.count ? [["2", "Levantar os autos das execuções e avaliar garantia", "FS", "Números dos processos", "Imediato", "Situação de cada execução"]] : []),
    ...(ix.omissions.length ? [["2", "Entregar as declarações omitidas", "Contabilidade", "Nenhuma", "Imediato", "Recibo de entrega"]] : []),
    ["3", "Pagar os tributos correntes no vencimento", "Empresa e contabilidade", "Nenhuma", "Mensal", "DARF pago"],
    ["4", "Emitir a CPEN", "FS", "Itens anteriores", cert.valid && certValid ? `Meta: até ${cert.valid}` : "Após a regularização", "CPEN emitida"],
  ];
  const docsNeeded = "Procuração eletrônica no e-CAC e acesso ao Regularize para a FS · balanço e DRE do último exercício e balancete do ano · faturamento mensal dos últimos 12 meses · extratos dos parcelamentos em curso · contrato social e documentos dos sócios.";

  // ---------- Seção 10-12 ----------
  const legal: [string, string][] = [
    ...(rfbTaxes.length ? [["Lei 10.522/2002, arts. 10, 13 e 14", "Parcelamento ordinário em até 60 parcelas com Selic; vedado para tributos retidos e descontados de terceiros"] as [string, string]] : []),
    ...(ix.natures.some(n => PREV.has(n.nature)) ? [["CF, art. 195, § 11", "Contribuições previdenciárias: parcelamento e transação limitados a 60 meses"] as [string, string]] : []),
    ...(pgfnOpen.length ? [["Lei 13.988/2020, art. 11; Portaria PGFN 6.757/2022", "Transação: desconto só para créditos de difícil recuperação (C ou D), até 65% do total, vedada a redução do principal; prazo até 120 meses"] as [string, string]] : []),
    ...(ix.execution.count || ix.filing.count ? [["Lei 6.830/1980, arts. 8º, 9º e 11", "Execução fiscal: prazo de 5 dias para pagar ou garantir; garantias; ordem da penhora"] as [string, string]] : []),
    ...(ix.filing.count || ix.plainCollection.count ? [["Portaria PGFN 33/2018", "Cobrança das inscrições não ajuizadas: protesto, averbação pré-executória e cadastros de inadimplentes"] as [string, string]] : []),
    ["CTN, arts. 151, 205 e 206", "Suspensão da exigibilidade; CND e CPEN"],
  ];
  const caveats = [
    ...(tx.available && tx.discounted ? [`A redução de ${money(tx.discount)} na PGFN é o teto legal; o desconto efetivo é definido pela PGFN na análise da proposta.`] : []),
    ...(pgfnOpen.length && !tx.available ? ["Sem CAPAG e composição das inscrições, a redução na PGFN não foi simulada; nenhum desconto é presumido."] : []),
    ...(tx.available ? [`Entrada de 6% em ${ENTRADA_MESES} meses e saldo em até ${PRAZO_GERAL - ENTRADA_MESES} prestações (previdenciárias até ${PRAZO_PREV - ENTRADA_MESES}) são premissas dos editais; as condições finais constam do termo.`] : []),
    ...(pendingWithoutValue ? ["Itens sem valor na fonte (DIVIDA e processos fiscais) estão fora do total até serem levantados."] : []),
    ...ix.toConfirm.map(c => `Código a confirmar: ${c}.`),
    `Valores na data-base de ${baseBr}, sujeitos a atualização pela Selic. Documento de apoio à decisão, elaborado exclusivamente com base nas fontes da seção 13.`,
  ];
  const conclusion: [string, string][] = [
    ["Situação", `${report.company.name} deve ${money(total)} à União: ${rfbKnown ? `${money(ix.rfbTotal)} na Receita e ` : ""}${money(ix.pgfnTotal)} na PGFN${negotiated.length ? `, dos quais ${money(sum(negotiated))} já negociados` : ""}. ${cert.kind ? `A ${cert.kind.match(/\((\w+)\)/)?.[1]} ${certValid ? `vence em ${cert.valid}` : `venceu em ${cert.valid}`}${impeding ? " e não seria renovada hoje" : ""}.` : ""}`],
    ...(rfbTaxes.length ? [["Receita Federal", `${money(sum(rfbTaxes))} em débitos vencidos. Caminho: parcelamento ordinário em até 60 parcelas${rfbOutside ? `, com ${money(rfbOutside)} de retidos e descontados pagos à vista e com prioridade` : ""}.`] as [string, string]] : []),
    ...(pgfnOpen.length ? [["PGFN", tx.available ? `${pgfnOpen.length} inscrições em cobrança (${money(ptotal)}). ${tx.discounted ? `Com rating ${tx.rating}, a transação admite redução de até ${money(tx.discount)} (teto legal)` : `Com rating ${tx.rating}, não há desconto`}; entrada estimada de ${money(tx.entry)}.` : `${pgfnOpen.length} inscrições em cobrança (${money(ptotal)}). A via (transação ou parcelamento) depende da CAPAG e da composição, a extrair no Regularize.`] as [string, string]] : []),
    ["Certidão", `Cumpridos os passos do plano, a empresa obtém a ${possible === "CND" ? "CND" : "CPEN, que tem o mesmo efeito da negativa"}.${cert.valid && certValid ? ` A meta é chegar a ${cert.valid} com a renovação liberada.` : ""}`],
  ];

  // ---------- Seção 13: anexos ----------
  const annexRfb = rfb.map(d => [d.tax.slice(0, 4), d.tax.replace(/^\d{4}-\d{2}\s*-\s*/, ""), d.period, dueOf(d) ?? "—", money(d.principal), money(d.fine), money(d.interest), money(d.total)]);
  const annexPgfn = pgfn.map(d => [d.id, d.tax, d.registeredAt ?? "—", stageLabels[stageOf(d.status)], money(d.total)]);
  const sourcesRows = report.sources.map(s => [s.title, s.provider, s.status === "pendente" ? "Pendente" : shortDate(s.collectedAt)]);

  return {
    report, ix, tx, cert, certValid, baseBr, company: report.company.name, cnpj: formatCnpj(report.company.cnpj), emission: base.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" }),
    rfbKnown, summaryKpis, fronts, steps, who, panelKpis, obstacles, sequence, documents, criteria, certRows, possible, mapGroups, whatImpedes,
    pgfnStages, pgfnTop, executionNote, triage: ix.triage.map(t => [t.debt.id, t.debt.tax, t.debt.registeredAt ?? "—", money(t.debt.total), t.reasons.join("; ")]),
    natureRows, o60, withheldTotal: rfbOutside, regimeSignal: ix.regimeSignal, txRows, rfbAlt, pgfnAlt, certPending, plan, docsNeeded, legal, caveats, conclusion,
    annexRfb, annexPgfn, sourcesRows, donut: { rfb: ix.rfbTotal, pgfnOpen: ptotal, negotiated: sum(negotiated) },
  };
}
export type StrategicModel = ReturnType<typeof strategicModel>;
