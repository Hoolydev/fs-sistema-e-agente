import Image from "next/image";
import type { DiagnosticReport } from "@/lib/diagnostico/model";
import { money } from "@/lib/diagnostico/model";
import { buildOpinion, percent, type OpinionBlock, type opinionMetrics } from "@/lib/diagnostico/opinion";
import "@/app/parecer.css";
const colors = ["#16364b", "#b59459", "#d5b777", "#eee0bf"];
function Charts({ metrics: m, report }: { metrics: ReturnType<typeof opinionMetrics>; report: DiagnosticReport }) {
  let cursor = 0;
  const stops = m.composition.map((v, i) => { const start = cursor; cursor += m.totals.pgfn && v !== null ? v / m.totals.pgfn * 100 : 0; return `${colors[i]} ${start}% ${cursor}%`; });
  const complete = m.composition.every(v => v !== null) && !!m.totals.pgfn;
  return <div className="op-charts">
    <section className="op-chart"><h4>Score de economia (potencial)</h4><div className="op-score-row"><div className="op-ring" style={{ background: `conic-gradient(#2e916e ${m.savingPercent ?? 0}%, #e8efeb 0)` }}><div><strong>{percent(m.savingPercent)}</strong><small>desconto-alvo</small></div></div><p><b>{report.capag.rating ?? "Rating não informado"}</b><br/>para {report.opinion?.scenario?.targetRating ?? "alvo não definido"}<br/><small>Potencial condicionado ao enquadramento e à aprovação.</small></p></div>
      {[{ label: "Sem desconto", value: m.totals.pgfn, color: "#8c9b9f" }, { label: "Com desconto", value: m.final, color: "#2e916e" }].map(row => <div className="op-bar-row" key={row.label}><span>{row.label}</span><div><i style={{ width: `${m.totals.pgfn && row.value !== null ? row.value / m.totals.pgfn * 100 : 0}%`, background: row.color }}/><strong>{money(row.value)}</strong></div></div>)}<p className="op-saving">Economia potencial de {money(m.discount)}</p>
    </section>
    <section className="op-chart"><h4>Composição do débito</h4><div className="op-score-row"><div className="op-ring" style={{ background: complete ? `conic-gradient(${stops.join(",")})` : "#e8efeb" }}><div><strong>PGFN</strong><small>{m.totals.count} inscrições</small></div></div><ul className="op-legend">{["Principal", "Multa", "Juros", "Encargo"].map((label, i) => <li key={label}><i style={{ background: colors[i] }}/><span><b>{label}</b> · {percent(m.composition[i] !== null && m.totals.pgfn ? m.composition[i]! / m.totals.pgfn * 100 : null)}<small>{money(m.composition[i])}</small></span></li>)}</ul></div><p>Principal preservado. Redução depende dos componentes elegíveis e dos limites da modalidade.</p></section>
  </div>;
}
function Block({ block, data }: { block: OpinionBlock; data: ReturnType<typeof buildOpinion> }) {
  switch (block.type) {
    case "heading": return <h3 className="op-heading">{block.text}</h3>;
    case "text": return <p className="op-text">{block.text}</p>;
    case "callout": return <aside className={`op-callout ${block.tone}`}><h4>{block.title}</h4><p>{block.text}</p></aside>;
    case "kpis": return <div className="op-kpis">{block.items.map(item => <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong>{item.detail && <small>{item.detail}</small>}</div>)}</div>;
    case "table": return <div className="op-table-scroll" tabIndex={0} role="region" aria-label={`Tabela: ${block.headers.join(", ")}`}><table><thead><tr>{block.headers.map((cell, i) => <th key={i} scope="col">{cell}</th>)}</tr></thead><tbody>{block.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>;
    case "charts": return <Charts metrics={data.metrics} report={data.report}/>;
  }
}
export function FiscalOpinion({ report }: { report: DiagnosticReport }) {
  const data = buildOpinion(report);
  return <div className="fiscal-opinion"><nav className="op-navigation" aria-label="Partes do parecer"><span>PARECER COMPLETO</span>{[{ index: 0, title: "Indicadores" }, { index: 2, title: "I · Passivo" }, { index: 4, title: "II · Transação" }, { index: 7, title: "III · Certidão" }, { index: 9, title: "IV · Recomendações" }].map(link => <a key={link.index} href={`#parecer-${link.index}`}>{link.title}</a>)}</nav>{data.pages.map((page, i) => <article className="op-page" id={`parecer-${i}`} key={page.title}><header className="op-brand"><Image src="/brand/fs-horizontal.png" alt="FS Soluções Tributárias" width={1581} height={274}/><div><b>PARECER · {report.id}</b><span>Versão {report.version} · {i + 1} / {data.pages.length}</span></div></header><div className="op-content"><div className={`op-title ${i === 0 ? "cover" : ""}`}><h2>{page.title}</h2><p>{page.subtitle}</p></div>{i === 0 && <div className="op-demo-label">{report.mode === "demo" ? "DEMONSTRAÇÃO · DADOS E CENÁRIOS FICTÍCIOS · SEM CONSULTA REAL" : "DOCUMENTO PARA REVISÃO TÉCNICA"}</div>}{page.blocks.map((block, j) => <Block key={j} block={block} data={data}/>)}</div><footer className="op-footer"><span>FS Soluções Tributárias · {report.mode === "demo" ? "Demonstração" : "Análise técnica"}</span><span>{i + 1} / {data.pages.length}</span></footer></article>)}</div>;
}
