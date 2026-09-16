import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { money, type DiagnosticReport } from "./model";
import { buildOpinion, percent, shortDate, type OpinionBlock } from "./opinion";

// The screen and PDF consume the same sections and computed financial model.
export function generateDiagnosticPdf(input: DiagnosticReport, logo: Uint8Array): ArrayBuffer {
  const data = buildOpinion(input), { report, metrics: m } = data;
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const navy = "#10283d", gold = "#b59459", green = "#2e916e", gray = "#5c6d79";
  const left = 14, width = 182, bottom = 277;
  let y = 38;
  const clean = (s: string) => s.replace(/[–—]/g, "-").replace(/\u00a0/g, " ");
  function page() { doc.addPage(); y = 38; }
  function room(height: number) { if (y + height > bottom) page(); }
  function style(size = 8.5, bold = false, color = gray) { doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor(color); }
  function paragraph(value: string, size = 8.5) {
    style(size); const lines: string[] = doc.splitTextToSize(clean(value), width);
    for (const line of lines) { room(4.5); style(size); doc.text(line, left, y); y += size * .47; }
    y += 3;
  }
  function heading(value: string) {
    style(10, true, navy); const lines: string[] = doc.splitTextToSize(clean(value), width);
    room(lines.length * 4.8 + 20); y += 2; style(10, true, navy); doc.text(lines, left, y); y += lines.length * 4.8;
    doc.setDrawColor(gold); doc.setLineWidth(.2); doc.line(left, y, left + width, y); y += 5;
  }
  function table(headers: string[], rows: string[][]) {
    room(22);
    autoTable(doc, { startY: y, margin: { top: 38, bottom: 20, left, right: left }, head: [headers.map(clean)], body: rows.map(row => row.map(clean)), theme: "striped",
      styles: { font: "helvetica", fontSize: 7.2, cellPadding: 1.5, textColor: "#304453", lineWidth: 0, overflow: "linebreak", valign: "top" },
      headStyles: { fillColor: navy, textColor: "#ffffff", fontStyle: "bold" }, alternateRowStyles: { fillColor: "#f1f5f6" }, rowPageBreak: "avoid",
      didDrawPage: d => { y = (d.cursor?.y ?? y) + 5; },
    });
  }
  function callout(block: Extract<OpinionBlock, { type: "callout" }>) {
    style(8); const lines: string[] = doc.splitTextToSize(clean(block.text), width - 10);
    style(8, true); const titleLines: string[] = doc.splitTextToSize(clean(block.title.toUpperCase()), width - 10);
    const height = 9 + titleLines.length * 3.8 + lines.length * 3.8;
    room(height + 4);
    const background = { gold: "#fcf7eb", red: "#fff3f1", green: "#eff7f2" }[block.tone];
    const accent = { gold, red: "#be5548", green }[block.tone];
    doc.setFillColor(background); doc.roundedRect(left, y, width, height, 1.2, 1.2, "F"); doc.setFillColor(accent); doc.rect(left, y, .8, height, "F");
    style(8, true, navy); doc.text(titleLines, left + 4, y + 5); style(8); doc.text(lines, left + 4, y + 6 + titleLines.length * 3.8); y += height + 5;
  }
  function kpis(items: Extract<OpinionBlock, { type: "kpis" }>["items"]) {
    room(24); const gap = 2.5, box = (width - gap * (items.length - 1)) / items.length;
    items.forEach((item, i) => {
      const x = left + i * (box + gap); doc.setFillColor(i === 2 ? "#f0f8f3" : i === 1 ? "#fcf8ee" : "#ffffff"); doc.setDrawColor(i === 2 ? "#c5ddcf" : "#dce3e5"); doc.setLineWidth(.2); doc.roundedRect(x, y, box, 22, 1, 1, "FD");
      style(6, false, gray); doc.text(doc.splitTextToSize(item.label, box - 5), x + 2.5, y + 4.5);
      style(11, true, i === 2 ? green : i === 1 ? "#a77c2f" : navy); let size = 11; while (doc.getTextWidth(clean(item.value)) > box - 5 && size > 7) { doc.setFontSize(--size); }
      doc.text(clean(item.value), x + 2.5, y + 14);
      if (item.detail) { style(6); doc.text(clean(item.detail), x + 2.5, y + 19); }
    }); y += 26;
  }
  function ring(x: number, cy: number, fractions: number[], colors: string[], label: string, sub: string) {
    let start = -Math.PI / 2; const radius = 10.5;
    doc.setDrawColor("#e8eeea"); doc.setLineWidth(4.7); doc.circle(x, cy, radius, "S");
    fractions.forEach((fraction, i) => {
      const end = start + Math.max(0, fraction) * Math.PI * 2;
      if (fraction > 0) {
        const points: [number, number][] = [];
        for (let a = start; a < end; a += .025) points.push([x + (radius + 2.35) * Math.cos(a), cy + (radius + 2.35) * Math.sin(a)]);
        points.push([x + (radius + 2.35) * Math.cos(end), cy + (radius + 2.35) * Math.sin(end)]);
        for (let a = end; a > start; a -= .025) points.push([x + (radius - 2.35) * Math.cos(a), cy + (radius - 2.35) * Math.sin(a)]);
        points.push([x + (radius - 2.35) * Math.cos(start), cy + (radius - 2.35) * Math.sin(start)]);
        doc.setFillColor(colors[i]); doc.lines(points.slice(1).map((p, n) => [p[0] - points[n][0], p[1] - points[n][1]]), points[0][0], points[0][1], [1, 1], "F", true);
      }
      start = end;
    });
    style(10, true, green); doc.text(label, x, cy + .7, { align: "center" }); style(5.5); doc.text(sub, x, cy + 4, { align: "center" }); doc.setLineWidth(.2);
  }
  function charts() {
    room(62); const box = (width - 3) / 2, right = left + box + 3, top = y;
    for (const x of [left, right]) { doc.setDrawColor("#dce4e6"); doc.roundedRect(x, top, box, 60, 1.2, 1.2, "S"); }
    style(7.5, true, navy); doc.text("SCORE DE ECONOMIA (POTENCIAL)", left + 3, top + 6); doc.text("COMPOSIÇÃO DO DÉBITO", right + 3, top + 6);
    ring(left + 17, top + 24, [(m.savingPercent ?? 0) / 100], [green], m.savingPercent === null ? "N/D" : percent(m.savingPercent), "desconto-alvo");
    style(7.2, true, navy); doc.text(clean(report.capag.rating ?? "Rating não informado"), left + 34, top + 17);
    style(7.2); doc.text(doc.splitTextToSize(`Alvo: ${report.opinion?.scenario?.targetRating ?? "Não definido"}.\nHipótese condicionada ao enquadramento e à aprovação.`, box - 38), left + 34, top + 22);
    [{ label: "Sem desconto", value: m.totals.pgfn, color: "#8c9b9f" }, { label: "Com desconto", value: m.final, color: green }].forEach((item, i) => {
      const by = top + 41 + i * 6; style(6); doc.text(item.label, left + 3, by + 2.5);
      doc.setFillColor("#edf1f2"); doc.rect(left + 25, by - 1, box - 29, 4.5, "F"); doc.setFillColor(item.color);
      const length = m.totals.pgfn && item.value !== null ? item.value / m.totals.pgfn * (box - 29) : 0;
      if (length > 0) doc.rect(left + 25, by - 1, length, 4.5, "F"); style(6, true, "#ffffff");
      if (length > 27) doc.text(clean(money(item.value)), left + 26, by + 2); else { style(6, true, navy); doc.text(clean(money(item.value)), left + 26, by + 2); }
    });
    style(6.8, true, green); doc.text(`Economia potencial: ${clean(money(m.discount))}`, left + 3, top + 56);
    const palette = [navy, gold, "#d5b777", "#eee0bf"];
    const complete = m.composition.every(v => v !== null) && !!m.totals.pgfn;
    ring(right + 17, top + 24, complete ? m.composition.map(v => v! / m.totals.pgfn!) : [], palette, "PGFN", `${m.totals.count} inscrições`);
    ["Principal", "Multa", "Juros", "Encargo"].forEach((name, i) => {
      const yy = top + 13 + i * 6; doc.setFillColor(palette[i]); doc.rect(right + 33, yy, 2, 2, "F"); style(6.3, true, navy); doc.text(`${name}: ${percent(m.composition[i] !== null && m.totals.pgfn ? m.composition[i]! / m.totals.pgfn * 100 : null)}`, right + 37, yy + 1.7); style(5.8); doc.text(clean(money(m.composition[i])), right + 37, yy + 4.5);
    });
    style(7); doc.text(doc.splitTextToSize("Principal preservado. Redução depende dos componentes elegíveis e limites da modalidade.", box - 6), right + 3, top + 47);
    y += 65;
  }
  data.pages.forEach((section, index) => {
    if (index) page();
    if (index === 0) {
      style(15, true, navy); doc.text(section.title, 105, y, { align: "center" }); y += 6;
      style(8, false, "#9a793f"); doc.text(section.subtitle, 105, y, { align: "center" }); y += 6;
      style(6.4, true, "#9a793f"); doc.text(report.mode === "demo" ? "DEMONSTRAÇÃO · DADOS E CENÁRIOS FICTÍCIOS · SEM CONSULTA REAL" : "DOCUMENTO PARA REVISÃO TÉCNICA", 105, y, { align: "center" }); y += 7;
    } else {
      doc.setFillColor(navy); doc.roundedRect(left, y - 3, width, 16, 1, 1, "F"); style(10.5, true, "#ffffff"); doc.text(section.title, 105, y + 3, { align: "center" }); style(7, false, "#d3dfe5"); doc.text(section.subtitle, 105, y + 8, { align: "center" }); y += 20;
    }
    for (const block of section.blocks) {
      switch (block.type) {
        case "heading": heading(block.text); break;
        case "text": paragraph(block.text); break;
        case "callout": callout(block); break;
        case "table": table(block.headers, block.rows); break;
        case "kpis": kpis(block.items); break;
        case "charts": charts(); break;
      }
    }
  });
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFillColor(navy); doc.rect(0, 0, 210, 28, "F"); doc.addImage(logo, "PNG", left, 6, 93, 16.12);
    style(6.8, true, "#dec898"); doc.text(`PARECER · ${report.id}`, 196, 11, { align: "right" });
    style(6.5, false, "#c2cfd9"); doc.text(`${shortDate(report.generatedAt)} · Versão ${report.version}`, 196, 16, { align: "right" });
    doc.setFillColor(gold); doc.rect(0, 28, 210, .7, "F"); doc.setDrawColor("#dfe5e8"); doc.setLineWidth(.2); doc.line(left, 283, 196, 283);
    style(6, false, gray); doc.text(`FS Soluções Tributárias · ${report.mode === "demo" ? "DEMONSTRAÇÃO - DADOS FICTÍCIOS" : "Análise técnica"}`, left, 288); doc.text(`${i} / ${pages}`, 196, 288, { align: "right" });
  }
  doc.setProperties({ title: `Parecer de transação tributária - ${report.company.name}`, subject: report.mode === "demo" ? "Demonstração do template - dados fictícios" : "Parecer para revisão", author: "FS Soluções Tributárias", creator: "Sistema FS" });
  return doc.output("arraybuffer");
}
