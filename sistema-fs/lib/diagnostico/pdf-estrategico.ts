import { createHash } from "node:crypto";
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import type { DiagnosticReport } from "./model";
import { strategicModel, type Kpi, type MapGroup, type StrategicModel } from "./estrategico";

// Padrão VOX: grafite + dourado, resumo de 1 página e diagnóstico estratégico. Logo oficial da FS nas áreas escuras.
const C = { slate: "#37474f", slateDark: "#2c3a41", gold: "#b0956a", goldText: "#9c7c45", ink: "#2f3b42", gray: "#6b7880", line: "#dcd8cf", soft: "#f6f4ef", red: "#b23b30", green: "#2e7d5b", redBg: "#fbefed", greenBg: "#eef6f1", goldBg: "#faf5ea", grayBg: "#f3f4f4" };
const toneColor = { red: C.red, gold: C.goldText, green: C.green, ink: C.ink } as const;
const L = 14, W = 182, BOTTOM = 280;
const clean = (s: string) => s.replace(/[–—]/g, "-").replace(/ /g, " ").replace(/−/g, "-");

function columns(widths: number[] = [], right: number[] = []) {
  const out: Record<number, { cellWidth?: number; halign?: "right" }> = {};
  widths.forEach((w, i) => { out[i] = { ...out[i], cellWidth: w }; });
  right.forEach(i => { out[i] = { ...out[i], halign: "right" }; });
  return out;
}
function canvas(model: StrategicModel) {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  doc.setCreationDate(new Date(model.report.generatedAt));
  doc.setFileId(createHash("sha256").update(JSON.stringify(model.report)).digest("hex").slice(0, 32));
  let y = 20;
  const st = (size = 8, bold = false, color: string = C.ink) => { doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor(color); };
  const SP = 0.45;
  const spaced = (text: string, x: number, yy: number, size = 6, color: string = C.gray, opts: { align?: "right" | "center" } = {}) => { st(size, false, color); doc.text(clean(text.toUpperCase()), x, yy, { charSpace: SP, ...opts }); };
  // Quebra de linha que mede o espaçamento entre letras (splitTextToSize não considera charSpace).
  const spacedLines = (text: string, size: number, max: number) => {
    st(size); const words = clean(text.toUpperCase()).split(" "), out: string[] = [];
    const width = (s: string) => doc.getTextWidth(s) + SP * Math.max(0, s.length - 1);
    for (const w of words) { const cur = out.at(-1); if (cur !== undefined && width(`${cur} ${w}`) <= max) out[out.length - 1] = `${cur} ${w}`; else out.push(w); }
    return out;
  };
  const page = () => { doc.addPage(); y = 20; };
  const room = (h: number) => { if (y + h > BOTTOM) page(); };
  const para = (text: string, size = 7.6, color: string = C.ink) => {
    st(size, false, color); const lines: string[] = doc.splitTextToSize(clean(text), W);
    for (const line of lines) { room(4); st(size, false, color); doc.text(line, L, y, { maxWidth: W }); y += size * 0.45; }
    y += 2.5;
  };
  const section = (n: string, title: string) => {
    room(22); y += 3; st(10, true, C.goldText); doc.text(n, L, y); st(10, true, C.slate); doc.text(clean(title), L + (n ? 6 : 0), y);
    y += 2.2; doc.setDrawColor(C.gold); doc.setLineWidth(0.3); doc.line(L, y, L + W, y); y += 5;
  };
  const sub = (title: string) => { room(14); st(8.5, true, C.goldText); doc.text(clean(title), L, y); y += 4.5; };
  const table = (head: string[], body: string[][], opts: { widths?: number[]; right?: number[]; size?: number; bold?: (r: string[]) => boolean; impede?: number; noHead?: boolean } = {}) => {
    if (!body.length) return;
    room(18);
    autoTable(doc, {
      startY: y, margin: { top: 18, bottom: 20, left: L, right: L }, head: [head.map(clean)], showHead: opts.noHead ? "never" : "everyPage", body: body.map(r => r.map(clean)), theme: "plain",
      styles: { font: "helvetica", fontSize: opts.size ?? 6.8, cellPadding: { top: 1.8, bottom: 1.8, left: 2, right: 2 }, textColor: C.ink, overflow: "linebreak", valign: "top", lineColor: C.line, lineWidth: { bottom: 0.15 } },
      headStyles: { fillColor: C.slate, textColor: "#ffffff", fontStyle: "bold", fontSize: (opts.size ?? 6.8) - 0.2 },
      alternateRowStyles: { fillColor: C.soft }, rowPageBreak: "avoid",
      columnStyles: columns(opts.widths, opts.right),
      didParseCell: d => {
        if (d.section === "body" && opts.bold?.(body[d.row.index] ?? [])) d.cell.styles.fontStyle = "bold";
        if (d.section === "body" && opts.impede !== undefined && d.column.index === opts.impede) {
          const v = String(d.cell.raw); d.cell.styles.fontStyle = "bold"; d.cell.styles.textColor = v === "Impede" ? C.red : v === "Impedirá" ? C.goldText : v === "Não impede" ? C.green : C.gray;
        }
      },
      didDrawPage: d => { y = (d.cursor?.y ?? y) + 4; },
    });
  };
  const box = (title: string, text: string, tone: "red" | "green" | "gold" | "gray") => {
    const bg = { red: C.redBg, green: C.greenBg, gold: C.goldBg, gray: C.grayBg }[tone], bar = { red: C.red, green: C.green, gold: C.gold, gray: C.gray }[tone];
    st(7.4); const lines: string[] = doc.splitTextToSize(clean(text), W - 10);
    const h = 9 + lines.length * 3.4; room(h + 3);
    doc.setFillColor(bg); doc.rect(L, y, W, h, "F"); doc.setFillColor(bar); doc.rect(L, y, 0.9, h, "F");
    spaced(title, L + 5, y + 5, 6.2, bar === C.gray ? C.ink : bar); st(7.4); doc.text(lines, L + 5, y + 9.5); y += h + 4;
  };
  const kpiGrid = (items: Kpi[], cols: number, h = 22) => {
    const gap = 3, w = (W - gap * (cols - 1)) / cols;
    for (let i = 0; i < items.length; i += cols) {
      room(h + 3);
      items.slice(i, i + cols).forEach((k, j) => {
        const x = L + j * (w + gap);
        doc.setFillColor(k.highlight ? C.goldBg : "#ffffff"); doc.setDrawColor(k.highlight ? C.gold : C.line); doc.setLineWidth(k.highlight ? 0.4 : 0.25); doc.roundedRect(x, y, w, h, 1.2, 1.2, "FD");
        const label = spacedLines(k.label, 5.6, w - 7);
        spaced(label[0]!, x + 3.5, y + 5, 5.6); if (label[1]) spaced(label[1], x + 3.5, y + 8, 5.6);
        let size = 11.5; st(size, true, toneColor[k.tone]); while (doc.getTextWidth(clean(k.value)) > w - 7 && size > 7) doc.setFontSize(--size);
        doc.text(clean(k.value), x + 3.5, y + (label[1] ? 14.5 : 12.5));
        st(5.8, false, C.gray); doc.text((doc.splitTextToSize(clean(k.detail), w - 7) as string[]).slice(0, 2), x + 3.5, y + (label[1] ? 18.3 : 16.5));
      });
      y += h + 3;
    }
  };
  const ring = (cx: number, cy: number, parts: { value: number; color: string }[], label: string, subLabel: string) => {
    const total = parts.reduce((a, p) => a + p.value, 0), r = 11, t = 2.6;
    doc.setDrawColor("#e9e6df"); doc.setLineWidth(t * 2); doc.circle(cx, cy, r, "S"); doc.setLineWidth(0.2);
    let start = -Math.PI / 2;
    for (const part of parts) {
      if (!total || part.value <= 0) continue;
      const end = start + part.value / total * Math.PI * 2, pts: [number, number][] = [];
      for (let a = start; a < end; a += 0.03) pts.push([cx + (r + t) * Math.cos(a), cy + (r + t) * Math.sin(a)]);
      pts.push([cx + (r + t) * Math.cos(end), cy + (r + t) * Math.sin(end)]);
      for (let a = end; a > start; a -= 0.03) pts.push([cx + (r - t) * Math.cos(a), cy + (r - t) * Math.sin(a)]);
      pts.push([cx + (r - t) * Math.cos(start), cy + (r - t) * Math.sin(start)]);
      doc.setFillColor(part.color); doc.lines(pts.slice(1).map((p, n) => [p[0] - pts[n]![0], p[1] - pts[n]![1]]), pts[0]![0], pts[0]![1], [1, 1], "F", true);
      start = end;
    }
    st(9, true, C.slate); doc.text(clean(label), cx, cy + 0.8, { align: "center" }); st(5.2, false, C.gray); doc.text(subLabel, cx, cy + 4, { align: "center" });
  };
  return { doc, st, spaced, page, room, para, section, sub, table, box, kpiGrid, ring, get y() { return y; }, set y(v: number) { y = v; } };
}
const short = (cents: number) => cents >= 100_000_000 ? `R$ ${(cents / 100_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mi` : `R$ ${(cents / 100_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;

function footer(c: ReturnType<typeof canvas>, label: string, skipFirst: boolean) {
  const { doc } = c, pages = doc.getNumberOfPages();
  for (let i = skipFirst ? 2 : 1; i <= pages; i++) {
    doc.setPage(i);
    if (!skipFirst || i > 1) { doc.setFillColor(C.slate); doc.rect(L, 9, W, 1.1, "F"); doc.setFillColor(C.gold); doc.rect(L, 10.4, W, 0.35, "F"); }
    c.st(5.6, false, "#9aa4a9"); doc.text(clean(label), L, 290); doc.text(`Página ${i} de ${pages}`, L + W, 290, { align: "right" });
  }
}

// ---------------- Diagnóstico Fiscal Estratégico ----------------
export function generateStrategicPdf(input: DiagnosticReport, logo: Uint8Array): ArrayBuffer {
  const m = strategicModel(input), c = canvas(m), { doc } = c, demo = m.report.mode === "demo";
  // Capa
  doc.setFillColor(C.slate); doc.rect(0, 0, 210, 297, "F"); doc.setFillColor(C.gold); doc.rect(0, 0, 9, 297, "F");
  doc.addImage(logo, "PNG", 26, 26, 92, 15.95);
  doc.setDrawColor(C.gold); doc.setLineWidth(0.3); doc.rect(140, 26, 52, 7); c.spaced(demo ? "Demonstração" : "Documento confidencial", 166, 30.8, 5.4, "#c8ad7f", { align: "center" });
  c.spaced("Diagnóstico e plano de regularização", 26, 100, 6.4, "#c8ad7f");
  c.st(24, true, "#ffffff"); doc.text(["DIAGNÓSTICO FISCAL", "ESTRATÉGICO"], 26, 115);
  c.st(10.5, false, "#e3e7e9"); doc.text("Situação atual, oportunidades de economia e caminho para a regularidade fiscal", 26, 136);
  doc.setDrawColor(C.gold); doc.setLineWidth(0.5); doc.line(26, 145, 86, 145);
  c.st(13, true, "#ffffff"); doc.text(clean(doc.splitTextToSize(m.company, 160)[0] as string), 26, 198);
  [["CNPJ", m.cnpj], ["Data-base", m.baseBr], ["Emissão", m.emission], ["Referência", `${m.report.id} · versão ${m.report.version}`]].forEach(([k, v], i) => { c.spaced(k!, 26, 208 + i * 6, 5.4, "#c8ad7f"); c.st(8, false, "#ffffff"); doc.text(clean(v!), 62, 208 + i * 6); });
  doc.setDrawColor("#5b6b73"); doc.setLineWidth(0.2); doc.line(26, 270, 192, 270);
  c.st(6.2, true, "#c8ad7f"); doc.text("FS Soluções Tributárias Ltda", 26, 276); c.st(6.2, false, "#c9d0d3"); doc.text("· CNPJ 47.733.961/0001-79 · Goiânia/GO · www.fssolucoestributarias.com.br", 59, 276);

  // Painel executivo
  c.page();
  c.st(10, true, C.slate); doc.text(demo ? "Painel executivo (DEMONSTRAÇÃO - dados fictícios)" : "Painel executivo: quanto a empresa deve, quanto precisará desembolsar e o que falta para regularizar", L, c.y); c.y += 2.2;
  doc.setDrawColor(C.gold); doc.setLineWidth(0.3); doc.line(L, c.y, L + W, c.y); c.y += 4;
  c.kpiGrid(m.panelKpis.slice(0, 3), 3); c.kpiGrid(m.panelKpis.slice(3, 6), 3); c.kpiGrid(m.panelKpis.slice(6), 2, 20);
  // Onde está a dívida
  c.room(52); const top = c.y, half = (W - 3) / 2;
  doc.setDrawColor(C.line); doc.setLineWidth(0.25); doc.roundedRect(L, top, half, 48, 1.2, 1.2, "S"); doc.roundedRect(L + half + 3, top, half, 48, 1.2, 1.2, "S");
  c.spaced("Onde está a dívida", L + 4, top + 6, 6, C.slate);
  const parts = [{ name: "PGFN em cobrança", value: m.donut.pgfnOpen, color: C.red }, { name: "Receita Federal", value: m.donut.rfb, color: C.gold }, { name: "PGFN já negociada", value: m.donut.negotiated, color: "#9aa8b0" }];
  c.ring(L + 20, top + 28, parts, short(parts.reduce((a, p) => a + p.value, 0)), "PGFN + RFB");
  parts.forEach((p, i) => { doc.setFillColor(p.color); doc.rect(L + 40, top + 16 + i * 8, 2.4, 2.4, "F"); c.st(6.6, false, C.ink); doc.text(clean(`${p.name}: ${p.name === "Receita Federal" && !m.rfbKnown ? "pendente (não consultada)" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(p.value / 100)}`), L + 44, top + 18 + i * 8); });
  const rx = L + half + 3;
  c.spaced("Receita Federal por natureza", rx + 4, top + 6, 6, C.slate);
  const natures = m.natureRows.slice(0, 5), maxN = Math.max(1, ...m.natureRows.map(r => Number(r[2]!.replace(/\D/g, ""))));
  if (!natures.length) { c.st(7, false, C.gray); doc.text(doc.splitTextToSize(!m.rfbKnown ? "Receita Federal não consultada: a Situação Fiscal exige procuração à FS ou o certificado da empresa." : "Nenhum débito em cobrança na Receita Federal na data-base.", half - 8), rx + 4, top + 16); }
  natures.forEach((r, i) => { const yy = top + 13 + i * 6.6, v = Number(r[2]!.replace(/\D/g, "")), barX = rx + 34, barW = half - 34 - 26; c.st(5.8, false, C.ink); doc.text(clean(r[3] ?? r[0]!), rx + 4, yy + 2); doc.setFillColor(v === maxN ? C.slate : C.gold); doc.rect(barX, yy - 0.2, Math.max(0.6, barW * v / maxN), 2.6, "F"); c.st(5.8, true, C.ink); doc.text(clean(r[2]!), rx + half - 4, yy + 2, { align: "right" }); });
  c.y = top + 52;
  if (m.obstacles.length) c.box("Principais obstáculos à regularidade fiscal", m.obstacles.map((o, i) => `${i + 1}. ${o}`).join(" "), "red");
  c.box("Resumo e sequência recomendada", m.sequence, "green");

  // Sumário
  c.page(); c.section("", "Sumário");
  const toc = ["Documentos examinados e critérios de confiabilidade", "A última certidão e a certidão possível", "Mapa completo da situação fiscal", "Dívida ativa: situação, execuções e prazos", "Receita Federal: composição e tratamento", "Transação na PGFN", "Comparativo das alternativas", "O que falta para emitir a certidão?", "Plano de execução e responsabilidades", "Fundamentação jurídica", "Ressalvas: o que este diagnóstico não promete", "Conclusão estratégica", "Fontes e anexos"];
  c.table(["", ""], toc.map((t, i) => [String(i + 1), t]), { widths: [10], size: 7.4, noHead: true, bold: r => r[0] === "8" });

  // 1
  c.page(); c.section("1", "Documentos examinados e critérios de confiabilidade");
  c.table(["Documento", "Emissão", "O que comprova"], m.documents, { widths: [80, 22] });
  c.para(m.criteria);
  // 2
  c.section("2", "A última certidão e a certidão possível");
  if (m.certRows.length) { c.sub("Última certidão apresentada"); c.table(["Campo", "Informação"], m.certRows, { widths: [45], bold: r => r[0] === "Data de validade" }); }
  else c.para(m.rfbKnown ? "O relatório da Receita não traz certidão emitida. Conferir no e-CAC antes de qualquer uso." : "Certidão não conferida: a Situação Fiscal da Receita Federal não foi consultada nesta análise. Conferir no e-CAC antes de qualquer uso.");
  c.box("CND e CPEN: a diferença que importa para a empresa", `A CND (art. 205 do CTN) só é emitida quando não existe débito algum, nem parcelado ou em discussão. A CPEN (art. 206 do CTN) é emitida quando existem débitos, mas todos estão com a cobrança suspensa (parcelamento ou transação em dia, recurso pendente) ou garantidos. As duas têm o mesmo efeito prático: servem para licitação, financiamento e contratos públicos. Certidão possível para ${m.company}: ${m.possible}.`, "gray");
  // 3
  c.section("3", "Mapa completo da situação fiscal");
  c.para(`Data de referência: ${m.baseBr}. A coluna "Certidão" indica se o item, isoladamente, impede a emissão da CPEN.`, 7);
  for (const g of m.mapGroups) mapGroup(c, g);
  c.box("O que efetivamente impede a certidão hoje", m.whatImpedes, "red");
  // 4
  c.section("4", "Dívida ativa: situação, execuções e prazos");
  if (m.pgfnStages.length) {
    c.table(["Situação na PGFN", "Inscrições", "Valor", "% PGFN"], m.pgfnStages, { right: [1, 2, 3] });
    c.box(m.ix.execution.count ? "Execuções fiscais: risco ao caixa" : "Cobrança na PGFN", m.executionNote, m.ix.execution.count ? "red" : "gold");
    c.sub("Maiores inscrições"); c.table(["Inscrição", "Tributo", "Inscrita em", "Situação", "Valor"], m.pgfnTop, { right: [4] });
    if (m.triage.length) { c.sub("Inscrições que merecem revisão de prazos"); c.table(["Inscrição", "Tributo", "Inscrita em", "Valor", "Por que revisar"], m.triage, { right: [3] }); c.para("Triagem, não conclusão: a prescrição conta da constituição definitiva do crédito (CTN, art. 174) e é interrompida pela citação e por parcelamentos. A revisão depende dos autos.", 6.8, C.gray); }
  } else c.para("Nenhuma inscrição em dívida ativa na PGFN na data-base.");
  // 5
  c.section("5", "Receita Federal: composição e tratamento");
  if (m.natureRows.length) {
    c.table(["Natureza", "Débitos", "Valor"], m.natureRows.map(r => r.slice(0, 3)), { right: [1, 2] });
    if (m.withheldTotal) c.box("Tributos retidos e descontados: tratamento prioritário", `${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(m.withheldTotal / 100)} são valores retidos de terceiros (IRRF, contribuição descontada dos segurados) que a empresa reteve e não repassou. Não entram no parcelamento ordinário (Lei 10.522/2002, art. 14, I) e têm repercussão além da esfera tributária: devem ser pagos primeiro, em DARF próprio.`, "gold");
    c.table(["Parcelamento ordinário (referência)", "Valor"], [["Débitos da Receita em cobrança", fmt(m.o60.total)], ["(-) Retidos, descontados e Simples", fmt(m.o60.excluded)], ["(=) Base parcelável", fmt(m.o60.eligible)], ["Parcela nominal em 60 meses", m.o60.plan ? `${fmt(m.o60.plan.regular)} (última ${fmt(m.o60.plan.last)})` : "—"]], { right: [1], bold: r => r[0]!.startsWith("(=)") });
    if (m.regimeSignal) c.box("Sinal de regime a confirmar", m.regimeSignal, "gray");
  } else c.para(m.rfbKnown ? "Nenhum débito em cobrança na Receita Federal na data-base." : "Receita Federal não consultada nesta análise (exige procuração à FS ou o certificado da empresa). Débitos, parcelamentos e omissões na Receita ficam pendentes; ausência de dado não significa ausência de débito.");
  // 6
  c.section("6", "Transação na PGFN");
  c.table(["Item", "Situação"], m.txRows, { widths: [50] });
  if (m.tx.available && m.tx.rows.length) {
    c.sub("Simulação da transação (teto legal)");
    c.table(["Inscrição", "Consolidado", "Principal", "Desconto máximo", "Valor final"], [...m.tx.rows.map(r => [r.debt.id, fmt(r.debt.total), fmt(r.principal), fmt(r.discount), fmt(r.final)]), ["Total", fmt(m.tx.total), fmt(m.tx.rows.reduce((a, r) => a + r.principal, 0)), fmt(m.tx.discount), fmt(m.tx.final)]], { right: [1, 2, 3, 4], bold: r => r[0] === "Total" });
    c.para(`Premissa de pagamento (padrão dos editais, a confirmar no termo): entrada de 6% sobre o valor sem desconto, ${fmt(m.tx.entry)}${m.tx.entryPlan ? ` em ${m.tx.entryPlan.count} parcelas de ${fmt(m.tx.entryPlan.regular)}` : ""}; saldo${m.tx.restPlan ? ` em ${m.tx.restPlan.count} prestações de ${fmt(m.tx.restPlan.regular)}` : ""}${m.tx.prevPlan ? ` e previdenciárias em ${m.tx.prevPlan.count} de ${fmt(m.tx.prevPlan.regular)}` : ""}, corrigidas pela Selic.`, 7);
    c.box("Leitura do quadro", "O desconto efetivo é fixado pela PGFN a partir da capacidade de pagamento; o valor acima é o teto, não o resultado garantido. A transação implica confissão irrevogável dos débitos e desistência de discussões sobre eles.", "gold");
  } else if (m.ix.pgfnTotal) c.box("Simulação pendente", `${m.tx.available ? "" : m.tx.reason} Anexe o Relatório Consolidado e a tela de CAPAG do Regularize para simular a transação por inscrição. Nenhum desconto é presumido.`, "gold");
  // 7
  c.section("7", "Comparativo das alternativas");
  if (m.rfbAlt.length) { c.sub("Receita Federal"); c.table(["Alternativa", "Débito", "Desembolso inicial", "Custo total", "Economia", "Condições"], m.rfbAlt, { right: [1, 2, 3, 4], widths: [32, 24, 32, 26, 20] }); }
  if (m.pgfnAlt.length) { c.sub("PGFN"); c.table(["Alternativa", "Débito", "Desembolso inicial", "Custo total", "Economia", "Condições"], m.pgfnAlt, { right: [1, 2, 3, 4], widths: [32, 24, 32, 26, 20] }); }
  if (!m.rfbAlt.length && !m.pgfnAlt.length) c.para("Não há débitos em cobrança a comparar.");
  // 8
  c.section("8", "O que falta para emitir a certidão?");
  c.box(`Resposta direta para ${m.company}`, `A certidão possível é a ${m.possible === "CND" ? "CND" : "CPEN, com os mesmos efeitos da negativa"}. Para ela faltam os eventos abaixo; protocolo de pedido não regulariza a situação: o evento que supera cada impedimento está na última coluna.`, "gold");
  for (const g of m.certPending) { c.sub(g.group); c.table(["Pendência", "Providência", "Responsável", "Custo estimado", "Condição para conclusão"], g.rows, { right: [3], widths: [44, 44, 30, 26] }); }
  // 9
  c.section("9", "Plano de execução e responsabilidades");
  c.table(["Prior.", "Ação", "Responsável", "Dependência", "Prazo", "Evidência de conclusão"], m.plan, { widths: [11, 55, 28, 28, 26] });
  c.box("Documentos e autorizações que a empresa deve fornecer", m.docsNeeded, "gray");
  // 10-12
  c.section("10", "Fundamentação jurídica"); c.table(["Dispositivo", "O que resolve no caso"], m.legal, { widths: [55] });
  c.section("11", "Ressalvas: o que este diagnóstico não promete"); for (const cv of m.caveats) c.para(`• ${cv}`, 7.2);
  c.section("12", "Conclusão estratégica");
  for (const [k, v] of m.conclusion) { c.room(10); c.st(7.6, true, C.ink); doc.text(`${k}.`, L, c.y); const w = doc.getTextWidth(`${k}. `); c.st(7.6); const lines: string[] = doc.splitTextToSize(clean(v), W - w); doc.text(lines[0]!, L + w, c.y); c.y += 3.5; if (lines.length > 1) { const rest: string[] = doc.splitTextToSize(clean(lines.slice(1).join(" ")), W); for (const l of rest) { c.room(4); doc.text(l, L, c.y); c.y += 3.5; } } c.y += 2; }
  c.para("É o diagnóstico, salvo melhor juízo.");
  c.room(16); doc.setDrawColor(C.line); doc.line(L, c.y, L + W, c.y); c.y += 5; c.st(6.8, false, C.gray); doc.text(`Goiânia/GO, ${m.emission}`, 105, c.y, { align: "center" }); c.st(6.8, true, C.ink); doc.text("FS Soluções Tributárias Ltda · CNPJ 47.733.961/0001-79", 105, c.y + 4, { align: "center" }); c.y += 12;
  // 13
  c.section("13", "Fontes e anexos");
  c.table(["Fonte", "Origem", "Consulta"], m.sourcesRows, { widths: [80, 60] });
  if (m.annexRfb.length) { c.sub("Anexo A: débitos na Receita Federal (SIEF)"); c.table(["Código", "Tributo", "PA", "Vencimento", "Principal", "Multa", "Juros", "Total"], m.annexRfb, { right: [4, 5, 6, 7], size: 6.2 }); }
  if (m.annexPgfn.length && !m.mapGroups.some(g => g.title.startsWith("D."))) { c.sub("Anexo B: inscrições na PGFN"); c.table(["Inscrição", "Tributo", "Inscrita em", "Situação", "Valor"], m.annexPgfn, { right: [4], size: 6.2 }); }
  footer(c, `FS Soluções Tributárias · Diagnóstico Fiscal Estratégico · ${m.company}${demo ? " · DEMONSTRAÇÃO" : ""}`, true);
  doc.setProperties({ title: `Diagnóstico Fiscal Estratégico - ${m.company}`, subject: demo ? "Demonstração - dados fictícios" : "Diagnóstico fiscal para revisão", author: "FS Soluções Tributárias", creator: "Sistema FS" });
  return doc.output("arraybuffer");
}
const fmt = (cents: number | null) => cents === null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
function mapGroup(c: ReturnType<typeof canvas>, g: MapGroup) {
  c.sub(g.title);
  c.table(["Órgão", "Tributo / origem", "Compet.", "Guia, processo ou CDA", "Valor", "Situação", "Certidão", "Tratamento"], [...g.rows.map(r => [r.orgao, r.tributo, r.compet, r.ref, r.valor, r.situacao, r.certidao, r.tratamento]), ...(g.subtotal ? [["", "Subtotal", "", "", g.subtotal, "", "", ""]] : [])], { widths: [11, 30, 16, 28, 22, 24, 15], right: [4], size: 6.2, impede: 6, bold: r => r[1] === "Subtotal" });
}

// ---------------- Resumo de 1 página ----------------
export function generateSummaryPdf(input: DiagnosticReport, logo: Uint8Array): ArrayBuffer {
  const m = strategicModel(input), c = canvas(m), { doc } = c, demo = m.report.mode === "demo";
  doc.setFillColor(C.slate); doc.rect(L, 10, W, 22, "F"); doc.setFillColor(C.gold); doc.rect(L, 32, W, 0.7, "F");
  doc.addImage(logo, "PNG", L + 5, 15.5, 62, 10.75);
  c.st(11.5, true, "#ffffff"); doc.text(demo ? "RESUMO (DEMONSTRAÇÃO)" : "RESUMO DO DIAGNÓSTICO FISCAL", L + W - 5, 20, { align: "right" });
  c.st(6.6, false, "#d9c49c"); doc.text("Situação atual, economia e caminho para a certidão", L + W - 5, 25.5, { align: "right" });
  c.y = 40; c.st(9, true, C.slate); doc.text(clean(m.company), L, c.y); const nw = doc.getTextWidth(clean(m.company)); c.st(7, false, C.gray); doc.text(` · CNPJ ${m.cnpj}`, L + nw, c.y); doc.text(`Data-base: ${m.baseBr}`, L + W, c.y, { align: "right" });
  c.y += 2.5; doc.setDrawColor(C.line); doc.line(L, c.y, L + W, c.y); c.y += 4;
  if (!m.rfbKnown) c.box("Leitura preliminar", "A Situação Fiscal da Receita Federal não foi consultada (exige procuração à FS ou o certificado da empresa). Este resumo mostra só a dívida ativa na PGFN; débitos na Receita, parcelamentos e certidão ficam pendentes.", "gold");
  c.kpiGrid(m.summaryKpis, 3, 21);
  c.y += 1; c.spaced("A solução, frente por frente", L, c.y, 6.4, C.slate); c.y += 1.5; doc.setDrawColor(C.gold); doc.line(L, c.y, L + W, c.y); c.y += 2.5;
  c.table(["Frente", "Quanto deve", "Solução", "Desembolso", "Economia"], m.fronts.map(f => [`${f.name}\n${f.sub}`, f.owed, f.solution, f.outlay, f.economy]), { widths: [32, 28, 66, 32], right: [1, 3, 4], size: 6.6 });
  c.para("Valores nominais na data-base. Na PGFN, a redução é o teto legal; o desconto efetivo é fixado pela PGFN. Retidos e descontados não entram no parcelamento ordinário e são pagos primeiro.", 6.2, C.gray);
  c.spaced("O que falta para regularizar", L, c.y, 6.4, C.slate); c.y += 1.5; doc.setDrawColor(C.gold); doc.line(L, c.y, L + W, c.y); c.y += 4;
  m.steps.forEach(([title, rest], i) => {
    c.st(7.2, true, C.ink); const tw = doc.getTextWidth(clean(title)); const lines: string[] = doc.splitTextToSize(clean(title + rest), W - 9);
    if (c.y + lines.length * 3.5 > 268) return;
    doc.setFillColor(C.gold); doc.circle(L + 2.3, c.y - 1, 2.1, "F"); c.st(6.4, true, "#ffffff"); doc.text(String(i + 1), L + 2.3, c.y + 0.2, { align: "center" });
    c.st(7.2, true, C.ink); doc.text(clean(title), L + 7, c.y); const gap = /^[ (]/.test(rest) ? 1.2 : 0; c.st(7.2); const body = clean(rest).trim(); const first = (doc.splitTextToSize(body, W - 9 - tw - gap) as string[])[0] ?? ""; doc.text(first, L + 7 + tw + gap, c.y);
    const remaining = body.slice(first.length).trim(); c.y += 3.6;
    if (remaining) for (const l of doc.splitTextToSize(remaining, W - 9) as string[]) { doc.text(l, L + 7, c.y); c.y += 3.4; }
    c.y += 0.8;
  });
  c.y += 1; c.spaced("Quem faz o quê", L, c.y, 6.4, C.slate); c.y += 1.5; doc.setDrawColor(C.gold); doc.line(L, c.y, L + W, c.y); c.y += 2.5;
  c.table(["", ""], m.who, { widths: [45], size: 6.8, noHead: true, bold: r => !!r[0] });
  c.st(5.6, false, "#9aa4a9"); doc.text(doc.splitTextToSize(clean(`Resumo do Diagnóstico Fiscal Estratégico de ${m.baseBr} (${m.report.id}), que traz os cálculos, fundamentos e fontes. Valores sujeitos a atualização pela Selic. A redução na PGFN é o teto legal. FS Soluções Tributárias Ltda · CNPJ 47.733.961/0001-79 · Goiânia/GO · www.fssolucoestributarias.com.br`), W), L, 284);
  doc.setProperties({ title: `Resumo do Diagnóstico Fiscal - ${m.company}`, author: "FS Soluções Tributárias", creator: "Sistema FS" });
  return doc.output("arraybuffer");
}
