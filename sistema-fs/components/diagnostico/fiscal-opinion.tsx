import Image from "next/image";
import type { DiagnosticReport } from "@/lib/diagnostico/model";
import { money } from "@/lib/diagnostico/model";
import { buildOpinion, percent, type OpinionBlock, type opinionMetrics } from "@/lib/diagnostico/opinion";
import "@/app/parecer.css";
const colors = ["#16364b", "#b59459", "#d5b777", "#eee0bf"];
const toneColor = { navy: "#10283d", gold: "#a77c2f", green: "#2e916e", orange: "#c0702a", red: "#be5548" } as const;
// Mesmas cores dos cartões do PDF; o tom definido no parecer prevalece sobre a regra antiga por posição.
const toneCard = { navy: { background: "#ffffff", borderColor: "#dfe5e6" }, gold: { background: "#fcf9f1", borderColor: "#e4d2ad" }, green: { background: "#f1f8f4", borderColor: "#c9e1d1" }, orange: { background: "#fdf3ea", borderColor: "#efd2b6" }, red: { background: "#fdf1ef", borderColor: "#efc9c3" } } as const;
// Mesmo painel do PDF: índice de saúde fiscal com fatores e composição (componentes PGFN ou, sem eles, origem RFB x PGFN).
function Charts({ metrics: m, report }: { metrics: ReturnType<typeof opinionMetrics>; report: DiagnosticReport }) {
  const hl = m.health, healthColor = toneColor[hl.band?.tone ?? "navy"];
  const shares = m.composition.map(v => m.totals.pgfn && v !== null ? v / m.totals.pgfn * 100 : 0);
  const stops = shares.map((share, i) => { const start = shares.slice(0, i).reduce((sum, x) => sum + x, 0); return `${colors[i]} ${start}% ${start + share}%`; });
  const complete = m.composition.every(v => v !== null) && !!m.totals.pgfn;
  const total = m.totals.total, rfbShare = total && m.totals.rfb !== null ? m.totals.rfb / total * 100 : 0;
  const origins = [{ name: "Receita Federal", value: m.totals.rfb, color: colors[1], count: `${report.debts.filter(d => d.origin === "RFB").length} débitos` }, { name: "Dívida ativa PGFN", value: m.totals.pgfn, color: colors[0], count: `${m.totals.count} inscrições` }];
  return <div className="op-charts">
    <section className="op-chart"><h4>Saúde fiscal</h4><div className="op-score-row"><div className="op-ring" style={{ background: `conic-gradient(${healthColor} ${hl.score ?? 0}%, #e8efeb 0)` }}><div><strong style={{ color: healthColor }}>{hl.score ?? "N/D"}</strong><small>de 100</small></div></div><p><b style={{ color: healthColor }}>{hl.band?.label ?? "Não avaliado"}</b><br/><small>{hl.partial ? `Índice parcial: ${hl.evaluatedMax} de 100 pontos avaliados. ` : ""}Indicador interno FS; não é CAPAG nem rating da PGFN.</small></p></div>
      {hl.factors.map(f => <div className="op-bar-row" key={f.label}><span>{f.label}</span><div><i style={{ width: `${f.points === null ? 0 : f.points / f.max * 100}%`, background: f.points === f.max ? "#2e916e" : "#b59459" }}/><strong>{f.points === null ? "Não avaliado" : `${f.points}/${f.max}`}</strong></div></div>)}
    </section>
    {complete
      ? <section className="op-chart"><h4>Composição do débito</h4><div className="op-score-row"><div className="op-ring" style={{ background: `conic-gradient(${stops.join(",")})` }}><div><strong>PGFN</strong><small>{m.totals.count} inscrições</small></div></div><ul className="op-legend">{["Principal", "Multa", "Juros", "Encargo"].map((label, i) => <li key={label}><i style={{ background: colors[i] }}/><span><b>{label}</b> · {percent(m.composition[i] !== null && m.totals.pgfn ? m.composition[i]! / m.totals.pgfn * 100 : null)}<small>{money(m.composition[i])}</small></span></li>)}</ul></div><p>Principal preservado. Redução depende dos componentes elegíveis e dos limites da modalidade.</p></section>
      : <section className="op-chart"><h4>Composição do passivo</h4><div className="op-score-row"><div className="op-ring" style={{ background: total ? `conic-gradient(${colors[1]} 0% ${rfbShare}%, ${colors[0]} ${rfbShare}% 100%)` : m.totals.pgfn ? colors[0] : "#e8efeb" }}><div><strong>{total === null ? "PGFN" : "Total"}</strong><small>{total === null ? "RFB pendente" : money(total)}</small></div></div><ul className="op-legend">{origins.map(o => <li key={o.name}><i style={{ background: o.color }}/><span><b>{o.name}</b>{o.value === null ? (o.name === "Receita Federal" && hl.rfbPresence ? " · há débitos" : " · pendente") : total ? ` · ${percent(o.value / total * 100)}` : ""}<small>{o.value === null ? (o.name === "Receita Federal" && hl.rfbPresence ? "Leitura do analista, sem valor" : "Sem valor apurado") : `${money(o.value)} · ${o.count}`}</small></span></li>)}</ul></div><p>Principal, multa, juros e encargo das inscrições PGFN não informados pela fonte.</p></section>}
  </div>;
}
function Block({ block, data }: { block: OpinionBlock; data: ReturnType<typeof buildOpinion> }) {
  switch (block.type) {
    case "heading": return <h3 className="op-heading">{block.text}</h3>;
    case "text": return <p className="op-text">{block.text}</p>;
    case "callout": return <aside className={`op-callout ${block.tone}`}><h4>{block.title}</h4><p>{block.text}</p></aside>;
    case "kpis": return <div className="op-kpis">{block.items.map(item => <div key={item.label} style={item.tone ? toneCard[item.tone] : block.items.some(i => i.tone) ? toneCard.navy : undefined}><span>{item.label}</span><strong style={item.tone ? { color: toneColor[item.tone] } : block.items.some(i => i.tone) ? { color: toneColor.navy } : undefined}>{item.value}</strong>{item.detail && <small>{item.detail}</small>}</div>)}</div>;
    case "table": return <div className="op-table-scroll" tabIndex={0} role="region" aria-label={`Tabela: ${block.headers.join(", ")}`}><table><thead><tr>{block.headers.map((cell, i) => <th key={i} scope="col">{cell}</th>)}</tr></thead><tbody>{block.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>;
    case "charts": return <Charts metrics={data.metrics} report={data.report}/>;
  }
}
export function FiscalOpinion({ report }: { report: DiagnosticReport }) {
  const data = buildOpinion(report);
  return <div className="fiscal-opinion"><nav className="op-navigation" aria-label="Partes do parecer"><span>PARECER COMPLETO</span>{[{ index: 0, title: "Indicadores" }, { index: 2, title: "I · Passivo" }, { index: 4, title: "II · Transação" }, { index: 7, title: "III · Certidão" }, { index: 9, title: "IV · Recomendações" }].map(link => <a key={link.index} href={`#parecer-${link.index}`}>{link.title}</a>)}</nav>{data.pages.map((page, i) => <article className="op-page" id={`parecer-${i}`} key={`${i}-${page.title}`}><header className="op-brand"><Image src="/brand/fs-horizontal.png" alt="FS Soluções Tributárias" width={1581} height={274}/><div><b>PARECER · {report.id}</b><span>Versão {report.version} · {i + 1} / {data.pages.length}</span></div></header><div className="op-content"><div className={`op-title ${i === 0 ? "cover" : ""}`}><h2>{page.title}</h2><p>{page.subtitle}</p></div>{i === 0 && <div className="op-demo-label">{report.mode === "demo" ? "DEMONSTRAÇÃO · DADOS E CENÁRIOS FICTÍCIOS · SEM CONSULTA REAL" : "DOCUMENTO PARA REVISÃO TÉCNICA"}</div>}{page.blocks.map((block, j) => <Block key={j} block={block} data={data}/>)}</div><footer className="op-footer"><span>FS Soluções Tributárias · {report.mode === "demo" ? "Demonstração" : "Análise técnica"}</span><span>{i + 1} / {data.pages.length}</span></footer></article>)}</div>;
}
