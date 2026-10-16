import { isJudicialStatus, type DiagnosticReport, type Debt } from "./model";
import { installments } from "./opinion";

// Leituras derivadas só dos dados já coletados (SITFIS + PGFN): nenhuma consulta nova.
// Tudo o que sai daqui é classificação ou contagem dos campos da fonte; o que é incerto vem marcado "a confirmar".

export type Nature = "previdenciaria" | "descontados" | "terceiros" | "corporativos" | "retidos" | "multa" | "simples" | "outros";
export const natureLabels: Record<Nature, string> = {
  previdenciaria: "Contribuições previdenciárias da empresa",
  descontados: "Contribuições descontadas dos segurados",
  terceiros: "Contribuições de terceiros (Sistema S, salário-educação, INCRA)",
  corporativos: "IRPJ, CSLL, PIS e COFINS",
  retidos: "Tributos retidos na fonte",
  multa: "Multa por obrigação acessória",
  simples: "Simples Nacional",
  outros: "Não classificado (conferir o código)",
};
export const natureRules: Record<Nature, string> = {
  previdenciaria: "Parcelamento limitado a 60 meses (CF, art. 195, § 11).",
  descontados: "Fora do parcelamento ordinário (Lei 10.522/2002, art. 14, I); limite de 60 meses (CF, art. 195, § 11).",
  terceiros: "Regra geral do parcelamento; tratamento na transação a confirmar no edital ou termo.",
  corporativos: "Regra geral do parcelamento ordinário (Lei 10.522/2002, art. 10).",
  retidos: "Fora do parcelamento ordinário (Lei 10.522/2002, art. 14, I).",
  multa: "Regra geral do parcelamento.",
  simples: "Parcelamento próprio do Simples Nacional (LC 123/2006, art. 21).",
  outros: "Classificação pendente: conferir o código de receita antes de simular.",
};
const order: Nature[] = ["previdenciaria", "descontados", "terceiros", "corporativos", "retidos", "multa", "simples", "outros"];
// Fora da base do parcelamento ordinário da Lei 10.522 (vedação do art. 14, I, ou regime próprio).
const outsideOrdinary: Nature[] = ["retidos", "descontados", "simples"];

// Códigos com leitura conhecida. "confirm" registra a dúvida que a descrição da fonte deixa.
const byCode: Record<string, [Nature, string?]> = {
  "4133": ["descontados"], "1082": ["descontados"], "1099": ["descontados"],
  "4156": ["previdenciaria"], "4162": ["previdenciaria", "abreviação da fonte (riscos ambientais / aposentadoria especial)"], "1138": ["previdenciaria"], "1646": ["previdenciaria"],
  "4201": ["terceiros"], "4224": ["terceiros"], "4309": ["terceiros"], "4321": ["terceiros"], "4338": ["terceiros"],
  "1170": ["terceiros"], "1176": ["terceiros"], "1191": ["terceiros"], "1196": ["terceiros"], "1200": ["terceiros"],
  "0561": ["retidos"], "0588": ["retidos"], "1708": ["retidos"], "3208": ["retidos"], "3280": ["retidos"], "1772": ["retidos"],
  "5952": ["retidos"], "5960": ["retidos"], "5979": ["retidos"], "5987": ["retidos"],
  "3560": ["retidos", "sigla \"IRPJ FONTE\" ambígua"], "6190": ["retidos", "sigla COSIRF"],
  "1804": ["corporativos", "descrição genérica \"contribuição social\", lida como CSLL"],
  "3551": ["corporativos"], "2089": ["corporativos"], "2372": ["corporativos"], "2484": ["corporativos"], "0810": ["corporativos"], "4493": ["corporativos"],
  "2172": ["corporativos"], "5856": ["corporativos"], "6912": ["corporativos"], "8109": ["corporativos"],
  "2203": ["multa"],
};
const plain = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
export const taxCode = (tax: string) => tax.match(/^\s*(\d{4})/)?.[1] ?? null;
export function natureOf(tax: string): { nature: Nature; confirm: string | null } {
  const code = taxCode(tax), known = code ? byCode[code] : undefined;
  if (known) return { nature: known[0], confirm: known[1] ?? null };
  const s = plain(tax);
  const nature: Nature = /SIMPLES|\bDAS\b/.test(s) ? "simples"
    : /FONTE|IRRF|\bRET\b|CSRF|COSIRF/.test(s) ? "retidos"
    : /SEGURAD/.test(s) ? "descontados"
    : /SAL\.?\s*EDUC|INCRA|SENAC|SESC|SEBRAE|SENAI|SESI|SEST|SENAT|TERCEIROS/.test(s) ? "terceiros"
    : /EMPREGADOR|PATRONAL|\bRAT\b|RI\.?\s*AMB|AP\.?\s*ESPECIAL|PREVID/.test(s) ? "previdenciaria"
    : /IRPJ|CSLL|CONTRIBUICAO SOCIAL|\bPIS\b|COFINS/.test(s) ? "corporativos"
    : /MAED|MULTA/.test(s) ? "multa" : "outros";
  return { nature, confirm: nature === "outros" ? "código sem leitura cadastrada" : code ? "código classificado pela descrição" : null };
}

// Estágio da cobrança na PGFN, pela situação transcrita da fonte.
export type Stage = "ajuizada" | "ajuizada_garantia" | "a_ser_ajuizada" | "cobranca" | "garantida" | "negociada" | "suspensa";
export const stageLabels: Record<Stage, string> = { ajuizada: "Ajuizada", ajuizada_garantia: "Ajuizada com garantia", a_ser_ajuizada: "A ser ajuizada", cobranca: "Em cobrança, sem ajuizamento", garantida: "Garantida", negociada: "Negociada / parcelada", suspensa: "Exigibilidade suspensa" };
const toBeFiled = (status: string) => /\bA\s+SER\s+AJUIZ/i.test(status);
export function stageOf(status: string): Stage {
  const s = plain(status);
  if (/NEGOCIAD|PARCELAD|TRANSACIONAD/.test(s)) return "negociada";
  if (/SUSPENS/.test(s)) return "suspensa";
  if (toBeFiled(s)) return "a_ser_ajuizada";
  if (isJudicialStatus(s)) return /GARANTI/.test(s) ? "ajuizada_garantia" : "ajuizada";
  return /GARANTI/.test(s) ? "garantida" : "cobranca";
}
// Execução em curso: situação ajuizada (inclusive negociada/garantida) ou número de juízo informado — nunca "a ser ajuizada".
// Payloads antigos marcavam "a ser ajuizada" com referência judicial; a situação da fonte prevalece.
export const inExecution = (d: Debt) => d.origin === "PGFN" && !toBeFiled(d.status) && (isJudicialStatus(d.status) || !!d.judicialProcess);

const parseDate = (v: string | null) => {
  if (!v) return null;
  const br = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/), iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return br ? new Date(Date.UTC(+br[3], +br[2] - 1, +br[1])) : iso ? new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3])) : null;
};
const sum = (list: Debt[]) => list.reduce((acc, d) => acc + d.total, 0);
export const share = (part: number, whole: number) => whole ? `${(part / whole * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : "—";
export const dayBr = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "UTC" });

export function intelligence(report: DiagnosticReport) {
  const pgfn = report.debts.filter(d => d.origin === "PGFN"), rfb = report.debts.filter(d => d.origin === "RFB");
  const pgfnTotal = sum(pgfn), rfbTotal = sum(rfb), base = new Date(report.generatedAt);
  const classified = report.debts.map(d => ({ debt: d, ...natureOf(d.tax) }));

  // Natureza: PGFN e Receita lado a lado, com a regra que pesa na negociação.
  const natures = order.map(nature => {
    const list = classified.filter(c => c.nature === nature), p = list.filter(c => c.debt.origin === "PGFN").map(c => c.debt), r = list.filter(c => c.debt.origin === "RFB").map(c => c.debt);
    return { nature, pgfnCount: p.length, pgfnTotal: sum(p), rfbCount: r.length, rfbTotal: sum(r), total: sum(p) + sum(r) };
  }).filter(n => n.pgfnCount + n.rfbCount);
  const toConfirm = [...new Map(classified.filter(c => c.confirm).map(c => [taxCode(c.debt.tax) ?? c.debt.tax, `${c.debt.tax.replace(/\s+/g, " ")}: ${c.confirm}`])).values()];

  // Estágio da cobrança na PGFN.
  const stages = (Object.keys(stageLabels) as Stage[]).map(stage => { const list = pgfn.filter(d => stageOf(d.status) === stage); return { stage, count: list.length, total: sum(list) }; }).filter(s => s.count);
  const execution = pgfn.filter(inExecution), filing = pgfn.filter(d => stageOf(d.status) === "a_ser_ajuizada"), plainCollection = pgfn.filter(d => stageOf(d.status) === "cobranca");
  const guaranteed = execution.filter(d => /GARANTI/i.test(plain(d.status)));

  // Idade da dívida ativa pelo ano de inscrição (data de inscrição não é data do fato gerador).
  const years = [...new Set(pgfn.map(d => parseDate(d.registeredAt)?.getUTCFullYear() ?? null))].sort((a, b) => (a ?? 9999) - (b ?? 9999)).map(year => {
    const list = pgfn.filter(d => (parseDate(d.registeredAt)?.getUTCFullYear() ?? null) === year);
    return { year: year === null ? "Não informado" : String(year), count: list.length, total: sum(list), execution: list.filter(inExecution).length };
  });

  // Concentração: maiores inscrições e processos administrativos.
  const ranked = [...pgfn].sort((a, b) => b.total - a.total);
  const top = (n: number) => sum(ranked.slice(0, n));
  const processes = [...pgfn.reduce((map, d) => { const key = d.administrativeProcess ?? "Não informado", cur = map.get(key) ?? { count: 0, total: 0 }; map.set(key, { count: cur.count + 1, total: cur.total + d.total }); return map; }, new Map<string, { count: number; total: number }>())].sort((a, b) => b[1].total - a[1].total);

  // Receita Federal por competência: o passivo que ainda está se formando (tributos; multa acessória fica só na natureza).
  const owed = rfb.filter(d => natureOf(d.tax).nature !== "multa");
  const periodKey = (period: string) => { const date = period.match(/^\d{2}\/(\d{2})\/(\d{4})$/); return date ? `${date[1]}/${date[2]}` : period; };
  const periodSort = (period: string) => { const m = period.match(/^(\d{2})\/(\d{4})$/), q = period.match(/^(\d)º TRIM\/(\d{4})$/); return m ? +m[2] * 100 + +m[1] : q ? +q[2] * 100 + +q[1] * 3 : 0; };
  const competences = [...new Set(owed.map(d => periodKey(d.period)))].sort((a, b) => periodSort(a) - periodSort(b)).map(period => {
    const list = owed.filter(d => periodKey(d.period) === period);
    return { period, count: list.length, principal: list.reduce((acc, d) => acc + (d.principal ?? 0), 0), total: sum(list) };
  });
  const monthly = competences.filter(c => /^\d{2}\/\d{4}$/.test(c.period)), lastYear = monthly.length ? monthly.at(-1)!.period.slice(3) : null;
  const yearMonths = monthly.filter(c => c.period.endsWith(`/${lastYear}`));
  const monthlyAverage = yearMonths.length ? { year: lastYear!, months: yearMonths.length, principal: Math.round(yearMonths.reduce((acc, c) => acc + c.principal, 0) / yearMonths.length), first: yearMonths[0]!.period, last: yearMonths.at(-1)!.period } : null;
  const dues = rfb.map(d => parseDate(d.status.match(/vencimento (\d{2}\/\d{2}\/\d{4})/)?.[1] ?? null)).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime());

  // Sinal de regime: PIS/COFINS cumulativos (8109, 2172) e não cumulativos (6912, 5856) em competências diferentes.
  const regimeSpan = (codes: string[]) => { const list = rfb.filter(d => codes.includes(taxCode(d.tax) ?? "")).map(d => periodKey(d.period)).sort((a, b) => periodSort(a) - periodSort(b)); return list.length ? `${list[0]} a ${list.at(-1)}` : null; };
  const cumulative = regimeSpan(["8109", "2172"]), nonCumulative = regimeSpan(["6912", "5856"]);
  const regimeSignal = cumulative && nonCumulative ? `PIS/COFINS cumulativos (códigos 8109 e 2172) nas competências ${cumulative} e não cumulativos (6912 e 5856) de ${nonCumulative}. Sugere mudança do regime de apuração, a confirmar com o contador: afeta porte, ECF e existência de prejuízo fiscal.` : null;

  // Parcelamento ordinário (Lei 10.522/2002, arts. 10 e 14, I): referência nominal sem redução, em até 60 parcelas.
  const ordinary = (origin: "PGFN" | "RFB" | null) => {
    const list = classified.filter(c => origin === null || c.debt.origin === origin);
    const of = (n: Nature) => list.filter(c => c.nature === n).reduce((acc, c) => acc + c.debt.total, 0);
    const total = list.reduce((acc, c) => acc + c.debt.total, 0), excluded = outsideOrdinary.reduce((acc, n) => acc + of(n), 0), eligible = total - excluded;
    return { total, retidos: of("retidos"), descontados: of("descontados"), simples: of("simples"), eligible, excluded, plan: eligible > 0 ? installments(eligible, 60) : null };
  };

  // Triagem de prazos: só aponta o que merece revisão com os autos. Nada aqui conclui prescrição.
  const sixYears = new Date(Date.UTC(base.getUTCFullYear() - 5, base.getUTCMonth(), base.getUTCDate()));
  const triage = pgfn.map(d => {
    const registered = parseDate(d.registeredAt), processYear = Number(d.administrativeProcess?.match(/\/(\d{4})-\d{2}$/)?.[1] ?? NaN);
    const reasons = [registered && registered <= sixYears ? "inscrita há 5 anos ou mais na data-base" : "", registered && processYear && registered.getUTCFullYear() - processYear >= 4 ? `processo de ${processYear}, inscrita em ${registered.getUTCFullYear()} (${registered.getUTCFullYear() - processYear} anos depois)` : ""].filter(Boolean);
    return { debt: d, reasons };
  }).filter(t => t.reasons.length).sort((a, b) => (parseDate(a.debt.registeredAt)?.getTime() ?? 0) - (parseDate(b.debt.registeredAt)?.getTime() ?? 0));

  // Certidão registrada no SITFIS e sua validade na data-base.
  const certificateValidity = parseDate(report.opinion?.certificateNote.match(/Data de Validade:\s*(\d{2}\/\d{2}\/\d{4})/)?.[1] ?? null);
  const certificateExpired = certificateValidity ? certificateValidity < base : null;

  // Registros sem valor transcritos do SITFIS: inscrições previdenciárias do sistema DIVIDA e processos fiscais devedores.
  const dividaLabel = (raw: string) => { const v = plain(raw); return /AJUIZ|DISTRIBUI/.test(v) ? "em ajuizamento/distribuição" : /INSCRICAO/.test(v) ? "inscritas em dívida ativa" : raw.trim().toLowerCase(); };
  const records = (section: string) => (report.supplements ?? []).filter(x => x.title.startsWith("SITFIS")).flatMap(x => x.rows).filter(r => r[0] === section).map(r => r[1] ?? "");
  const divida = records("Pendência - Inscrição (Sistema DIVIDA)").flatMap(text => [...text.matchAll(/Inscrição:\s*([\d.]+-\d)\s+Situação:\s*(?:\d+\s*-\s*)?([^·]+)/g)].map(m => ({ id: m[1]!, situation: dividaLabel(m[2]!) })));
  const dividaBySituation = [...divida.reduce((map, d) => map.set(d.situation, (map.get(d.situation) ?? 0) + 1), new Map<string, number>())];
  const sitfisRows = (report.supplements ?? []).filter(x => x.title.startsWith("SITFIS")).flatMap(x => x.rows);
  const omissions = sitfisRows.filter(r => /^(Pendência - )?Omissão/.test(r[0] ?? "")).map(r => `${(r[0] ?? "").replace(/^Pendência - /, "").replace(/\*$/, "")} (${(r[1] ?? "").split(" · ")[0]!.replace(/^\(([^)]+)\)\s*/, (_, l: string) => `${l.toLowerCase()} `).trim()})`);
  const lateInstallments = sitfisRows.filter(r => /^Pendência - Parcelamento/.test(r[0] ?? "")).map(r => ({ system: (r[0] ?? "").match(/\(([^)]+)\)/)?.[1] ?? "", parcels: Number((r[1] ?? "").match(/Parcelas em atraso\s*·?\s*(\d+)/i)?.[1] ?? 0) }));
  const fiscalProcesses = records("Pendência - Processo Fiscal (SIEF)").flatMap(text => text.match(/\d{5}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g) ?? []);

  return {
    pgfnTotal, rfbTotal, natures, toConfirm, stages, execution: { count: execution.length, total: sum(execution), guaranteed: guaranteed.length, guaranteedTotal: sum(guaranteed) },
    filing: { count: filing.length, total: sum(filing) }, plainCollection: { count: plainCollection.length, total: sum(plainCollection) },
    years, ranked, concentration: { top5: top(5), top10: top(10) }, processes, competences, monthlyAverage, oldestDue: dues[0] ?? null, regimeSignal,
    divida, dividaBySituation, fiscalProcesses, omissions, lateInstallments,
    ordinary: { pgfn: ordinary("PGFN"), rfb: ordinary("RFB"), federal: ordinary(null) }, triage, certificateValidity, certificateExpired,
  };
}
export type Intelligence = ReturnType<typeof intelligence>;
