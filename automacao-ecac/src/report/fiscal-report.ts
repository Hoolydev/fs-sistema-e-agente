import { rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import type { FiscalAnalysis } from "../llm/openai-analysis.js";
import type { FiscalSourceDocument } from "../rpa/federal-debt-flow.js";

const NAVY = "#102641";
const GOLD = "#b58a3a";

export interface FiscalReportInput {
  scopeNotice?: string;
  cnpj: string;
  companyName: string;
  analysis: FiscalAnalysis;
  sources: FiscalSourceDocument[];
  destination: string;
}

export async function generateFiscalReport(input: FiscalReportInput): Promise<void> {
  const htmlPath = `${input.destination}.html`;
  await writeFile(htmlPath, renderHtml(input), "utf8");
  const browser = await chromium.launch({
    headless: true,
    ...(process.platform === "darwin" ? { channel: "chrome" as const } : {}),
  });
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(resolve(htmlPath)).href, { waitUntil: "load" });
    await page.pdf({
      path: input.destination,
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
  } finally {
    await browser.close();
    await rm(htmlPath, { force: true }).catch(() => undefined);
  }
}

export function renderHtml({ cnpj, companyName, analysis, sources, scopeNotice }: FiscalReportInput): string {
  const generatedAt = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
  const risk = {
    low: "Baixo",
    medium: "Médio",
    high: "Alto",
    critical: "Crítico",
  }[analysis.riskLevel];
  const findings = analysis.findings.map((finding, index) => `
    <article class="finding">
      <div class="finding-number">${String(index + 1).padStart(2, "0")}</div>
      <div>
        <div class="severity ${finding.severity}">${severityLabel(finding.severity)}</div>
        <h3>${escapeHtml(finding.title)}</h3>
        <p>${formatText(finding.description)}</p>
        <h4>Impacto</h4><p>${formatText(finding.impact)}</p>
        <h4>Recomendação</h4><p>${formatText(finding.recommendation)}</p>
        <p class="references">Fontes: ${finding.sourceReferences.map(escapeHtml).join(", ")}</p>
      </div>
    </article>`).join("");
  const recommendations = analysis.recommendations
    .map((item, index) => `<li><span>${index + 1}</span><p>${formatText(item)}</p></li>`)
    .join("");
  const gaps = analysis.gaps.map((item) => `<li>${formatText(item)}</li>`).join("");
  const caveats = analysis.caveats.map((item) => `<li>${formatText(item)}</li>`).join("");
  const sourceRows = sources.map((source) => `
    <tr><td>${escapeHtml(source.sourceId)}</td><td>${escapeHtml(source.title)}</td><td>${source.pages}</td><td>${formatTimestamp(source.obtainedAt)}</td></tr>`).join("");

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Diagnóstico Fiscal Federal</title>
<style>
@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;color:#1f2937;font:10pt/1.55 Arial,sans-serif;background:#fff}.cover{min-height:297mm;padding:30mm 20mm;background:${NAVY};color:#fff;display:flex;flex-direction:column}.brand{color:${GOLD};font-size:10pt;letter-spacing:3px;text-transform:uppercase}.subbrand{font-size:8pt;letter-spacing:1.4px;opacity:.7;margin-top:3px}.cover h1{font-size:28pt;line-height:1.12;margin:45mm 0 8mm;max-width:150mm}.company{font-size:16pt;font-weight:700}.cnpj{opacity:.72;margin-top:2mm}.cover-kpis{margin-top:auto;display:grid;grid-template-columns:1fr 1fr;gap:5mm;border-top:1px solid rgba(255,255,255,.22);padding-top:8mm}.kpi small{display:block;color:${GOLD};text-transform:uppercase;letter-spacing:1px}.kpi strong{display:block;font-size:15pt;margin-top:2mm}.content{padding:17mm 20mm}.section{margin-bottom:13mm}.section h2{font-size:13pt;color:${NAVY};text-transform:uppercase;letter-spacing:1.3px;border-bottom:1px solid ${GOLD};padding-bottom:2.5mm;margin:0 0 6mm}.summary{font-size:11pt;text-align:justify}.finding{display:grid;grid-template-columns:13mm 1fr;gap:4mm;border-left:3px solid ${GOLD};padding:4mm 5mm;margin:0 0 6mm;background:#f7f8fa;break-inside:avoid}.finding-number{font-size:18pt;color:${GOLD};font-weight:700}.finding h3{margin:1mm 0 3mm;color:${NAVY};font-size:12pt}.finding h4{margin:3mm 0 1mm;text-transform:uppercase;font-size:7.5pt;letter-spacing:1px;color:#64748b}.finding p{margin:0 0 2mm;text-align:justify}.severity{display:inline-block;font-size:7pt;text-transform:uppercase;letter-spacing:1px;padding:1mm 2mm;border-radius:2px;background:#e5e7eb}.severity.high,.severity.critical{color:#991b1b;background:#fee2e2}.severity.medium{color:#92400e;background:#fef3c7}.severity.low{color:#166534;background:#dcfce7}.references{font-size:7.5pt;color:#64748b;margin-top:3mm!important}.actions{list-style:none;padding:0;counter-reset:item}.actions li{display:grid;grid-template-columns:9mm 1fr;gap:3mm;margin-bottom:4mm;break-inside:avoid}.actions span{width:8mm;height:8mm;border-radius:50%;background:${NAVY};color:#fff;text-align:center;line-height:8mm;font-weight:700}.actions p{margin:0}.notice{padding:4mm 5mm;background:#fbf7ed;border:1px solid #e7d7b5}.notice li{margin-bottom:2mm}table{width:100%;border-collapse:collapse;font-size:8pt}th{text-align:left;color:${NAVY};border-bottom:2px solid ${GOLD};padding:2mm}td{padding:2mm;border-bottom:1px solid #e5e7eb}.footer{font-size:7.5pt;color:#64748b;border-top:1px solid #d1d5db;padding-top:4mm;margin-top:12mm}.page-break{break-before:page}
</style></head><body>
<section class="cover"><div><div class="brand">FS Soluções Tributárias</div><div class="subbrand">Consultoria e Planejamento Fiscal</div></div><h1>DIAGNÓSTICO<br>FISCAL FEDERAL</h1><div class="company">${escapeHtml(companyName)}</div><div class="cnpj">CNPJ ${formatCnpj(cnpj)}</div>${scopeNotice ? `<p>${escapeHtml(scopeNotice)}</p>` : ""}<div class="cover-kpis"><div class="kpi"><small>Nível de risco</small><strong>${risk}</strong></div><div class="kpi"><small>Fontes oficiais</small><strong>${sources.length} relatórios</strong></div><div class="kpi"><small>Achados</small><strong>${analysis.findings.length}</strong></div><div class="kpi"><small>Emitido em</small><strong>${generatedAt}</strong></div></div></section>
<main class="content"><section class="section"><h2>01 Diagnóstico executivo</h2><div class="summary">${formatText(analysis.executiveSummary)}</div></section><section class="section"><h2>02 Levantamento e achados</h2>${findings || "<p>Nenhum achado foi identificado nas fontes recebidas.</p>"}</section><section class="section page-break"><h2>03 Plano de ação recomendado</h2><ol class="actions">${recommendations}</ol></section>${gaps ? `<section class="section"><h2>04 Pontos pendentes</h2><div class="notice"><ul>${gaps}</ul></div></section>` : ""}${caveats ? `<section class="section"><h2>05 Limites da análise</h2><div class="notice"><ul>${caveats}</ul></div></section>` : ""}<section class="section"><h2>Fontes oficiais</h2><table><thead><tr><th>ID</th><th>Documento</th><th>Páginas</th><th>Coleta</th></tr></thead><tbody>${sourceRows}</tbody></table></section><div class="footer">Relatório elaborado exclusivamente a partir dos documentos identificados na tabela de fontes. Recomenda-se revisão técnica antes da adoção de medidas fiscais ou jurídicas.</div></main></body></html>`;
}

function formatText(value: string): string {
  return escapeHtml(value).replace(/\n\n+/g, "</p><p>").replace(/\n/g, "<br>");
}

function escapeHtml(value: string): string {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function severityLabel(value: FiscalAnalysis["riskLevel"]): string {
  return { low: "Baixo", medium: "Médio", high: "Alto", critical: "Crítico" }[value];
}

function formatCnpj(value: string): string {
  return escapeHtml(value.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5"));
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}
