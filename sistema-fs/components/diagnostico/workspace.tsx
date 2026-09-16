"use client";

import { useState, type FormEvent } from "react";
import { DocumentLibrary } from "@/components/documentos/library";
import { FiscalOpinion } from "./fiscal-opinion";
import { ArrowDownToLine, ArrowRight, Building2, ChevronRight, Clock3, FileCheck2, FileText, Info, LoaderCircle, Search, ShieldCheck, X } from "lucide-react";
import { demoReport } from "@/lib/diagnostico/demo";
import { formatCnpj, isValidCnpj, money, normalizeCnpj, summarize, type Debt } from "@/lib/diagnostico/model";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const tabs = ["Visão geral", "Receita Federal", "Dívida ativa", "Estratégia", "Fontes", "Parecer completo"];
const date = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value));

export default function DiagnosticWorkspace() {
  const [tab, setTab] = useState("Visão geral");
  const [cnpj, setCnpj] = useState("");
  const [reportVisible, setReportVisible] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Todas as situações");
  const [selected, setSelected] = useState<Debt | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const report = demoReport;
  const totals = summarize(report);
  const pgfnPercent = totals.total && totals.pgfn !== null ? totals.pgfn / totals.total * 100 : 0;

  async function consult(event: FormEvent) {
    event.preventDefault();
    if (!isValidCnpj(cnpj)) { setError("Confira o CNPJ informado. Os dígitos verificadores não são válidos."); return; }
    setLoading(true); setError(""); setReportVisible(false);
    try {
      const response = await fetch("/api/diagnosticos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cnpj: normalizeCnpj(cnpj) }) });
      const data = await response.json();
      setError(data.message ?? "A consulta não retornou um diagnóstico. Tente novamente mais tarde.");
    } catch { setError("Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente."); }
    finally { setLoading(false); }
  }
  async function download() {
    setPdfBusy(true); setError("");
    try {
      const response = await fetch("/api/diagnosticos/demo/pdf");
      if (!response.ok) throw new Error("pdf");
      const blob = await response.blob(); const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "FS-Parecer-Demonstrativo.pdf"; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 15000);
    } catch { setError("Não foi possível gerar o PDF. Tente novamente."); }
    finally { setPdfBusy(false); }
  }
  function restoreDemo() { setReportVisible(true); setError(""); setTab("Visão geral"); setCnpj(""); setQuery(""); setStatus("Todas as situações"); }
  const filtered = report.debts.filter(d => d.origin === (tab === "Receita Federal" ? "RFB" : "PGFN") && `${d.id} ${d.tax} ${d.period}`.toLowerCase().includes(query.toLowerCase()) && (status === "Todas as situações" || d.status === status));

  return <div className="diagnostic">
    <div className="diag-heading"><div><p className="diag-eyebrow">INTELIGÊNCIA TRIBUTÁRIA</p><h1>Diagnóstico da empresa</h1><p>Do levantamento dos débitos à próxima decisão.</p></div><span className="diag-chip"><span /> Serpro: ativação pendente</span></div>
    <DocumentLibrary compact/>
    <form className="diag-search" onSubmit={consult}>
      <div className="diag-search-label"><Building2 size={21}/><div><label htmlFor="analysis-cnpj">Analisar uma empresa</label><small>Informe o CNPJ do cliente para iniciar o levantamento.</small></div></div>
      <div className="diag-search-controls"><input id="analysis-cnpj" value={cnpj} onChange={e => { setCnpj(e.target.value); setError(""); }} placeholder="00.000.000/0001-00" maxLength={18} autoComplete="off" aria-describedby={error ? "diagnostic-error" : undefined}/><button className="diag-button primary" disabled={loading} type="submit">{loading ? <LoaderCircle className="spin" size={16}/> : <Search size={16}/>} {loading ? "Verificando…" : "Analisar CNPJ"}</button></div>
    </form>
    {error && <div role="alert" className="diag-alert" id="diagnostic-error"><Info size={19}/><p>{error}</p><button onClick={() => setError("")} aria-label="Fechar aviso"><X size={16}/></button></div>}
    {!reportVisible ? <div className="diag-empty"><FileText size={36}/><h2>{loading ? "Verificando disponibilidade" : "Consulta aguardando ativação"}</h2><p>O diagnóstico real aparecerá aqui após a conexão com as fontes fiscais. Nenhum dado demonstrativo será atribuído ao CNPJ informado.</p><button className="diag-button" onClick={restoreDemo} disabled={loading}>Explorar diagnóstico demonstrativo <ArrowRight size={16}/></button></div> : <>
      <div className="diag-demo-banner"><Info size={16}/><p><strong>Demonstração do sistema.</strong> Empresa, valores e inscrições fictícios. Nenhuma consulta real foi realizada.</p></div>
      <section className="diag-company"><div className="diag-company-icon"><Building2 size={23}/></div><div className="diag-company-name"><h2>{report.company.name}</h2><p>CNPJ ilustrativo {formatCnpj(report.company.cnpj)} <span>•</span> Referência {date(report.generatedAt)}</p></div><div className="diag-company-actions"><button className="diag-button" onClick={() => setTab("Parecer completo")}><FileText size={16}/> Ver parecer</button><button className="diag-button primary" onClick={download} disabled={pdfBusy}>{pdfBusy ? <LoaderCircle className="spin" size={16}/> : <ArrowDownToLine size={16}/>} {pdfBusy ? "Gerando PDF…" : "Baixar PDF"}</button></div></section>
      <div className="diag-tabs" role="tablist" aria-label="Áreas do diagnóstico">{tabs.map((name, i) => <button key={name} role="tab" id={`diag-tab-${i}`} aria-controls="diag-tab-panel" aria-selected={tab === name} className={tab === name ? "active" : ""} onClick={() => { setTab(name); setQuery(""); setStatus("Todas as situações"); }} onKeyDown={e => { if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return; e.preventDefault(); const next = e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length; setTab(tabs[next]); setQuery(""); setStatus("Todas as situações"); document.getElementById(`diag-tab-${next}`)?.focus(); }} tabIndex={tab === name ? 0 : -1}>{name}</button>)}</div>
      <div id="diag-tab-panel" role="tabpanel" aria-labelledby={`diag-tab-${tabs.indexOf(tab)}`}>
      {tab === "Visão geral" && <>
        <div className="diag-kpis"><div className="diag-kpi debt-total"><div>Total de débitos <span>DEMONSTRATIVO</span></div><strong>{money(totals.total)}</strong><small>Receita Federal + dívida ativa</small></div><div className="diag-kpi"><div>Dívida ativa · PGFN</div><strong>{money(totals.pgfn)}</strong><small>{String(totals.count).padStart(2, "0")} inscrições no exemplo</small></div><div className="diag-kpi"><div>Receita Federal</div><strong>{money(totals.rfb)}</strong><small>03 pendências no exemplo</small></div></div>
        <div className="diag-overview-grid"><section className="diag-card"><div className="diag-card-title"><h3>Distribuição dos débitos</h3><small>Por origem</small></div><div className="diag-bars">{[{ label: "Dívida ativa · PGFN", value: totals.pgfn, color: "red" }, { label: "Receita Federal", value: totals.rfb, color: "gold" }].map(item => <div key={item.label}><div className="diag-bar-label"><span>{item.label}</span><strong>{money(item.value)}</strong></div><div className="diag-bar-track"><div className={item.color} style={{ width: `${totals.total ? (item.value ?? 0) / totals.total * 100 : 0}%` }}/></div></div>)}<div className="diag-chart-axis"><span>R$ 0</span><span>R$ 170 mil</span><span>R$ 340 mil</span></div></div><div className="diag-chart-bottom"><div className="diag-donut" style={{ background: `conic-gradient(#ee4e53 ${pgfnPercent}%, #bea16c 0)` }}><div><b>02</b><small>fontes</small></div></div><p><strong>{pgfnPercent.toFixed(1).replace(".", ",")}%</strong> do passivo ilustrativo está em dívida ativa.</p></div></section>
        <section className="diag-card"><div className="diag-card-title"><h3>Frentes do diagnóstico</h3><ShieldCheck size={19}/></div>{[{ name: "Situação fiscal", detail: "Receita Federal", target: "Receita Federal", badge: "Conferência" }, { name: "Inscrições e processos", detail: "Procuradoria-Geral da Fazenda Nacional", target: "Dívida ativa", badge: "Mapeamento" }, { name: "Capacidade de pagamento", detail: "Documentos complementares", target: "Estratégia", badge: "A complementar" }].map((front, i) => <button className="diag-front" key={front.name} onClick={() => setTab(front.target)}><span className="diag-front-number">0{i + 1}</span><span className="diag-front-name"><strong>{front.name}</strong><small>{front.detail}</small></span><span className={`diag-status ${i === 2 ? "pending" : ""}`}>{front.badge}</span><ChevronRight size={15}/></button>)}<div className="diag-review-note"><Clock3 size={18}/><p>A estratégia será concluída após a conferência das fontes e dos documentos pendentes.</p></div></section></div>
        <section className="diag-card diag-summary"><div><span className="diag-eyebrow">LEITURA EXECUTIVA</span><h3>Uma visão consolidada para orientar cada decisão.</h3></div><p>{report.summary}</p><button className="diag-text-button" onClick={() => setTab("Parecer completo")}>Ler diagnóstico completo <ArrowRight size={16}/></button></section>
        <div className="diag-bottom-note"><span/><p><strong>O diagnóstico é o ponto de partida.</strong> A estratégia depende da análise técnica de cada caso.</p></div>
      </>}
      {(tab === "Receita Federal" || tab === "Dívida ativa") && <section className="diag-card"><div className="diag-card-title"><div><h3>{tab === "Receita Federal" ? "Pendências na Receita Federal" : "Inscrições em dívida ativa"}</h3><p>Todos os valores desta tela são demonstrativos.</p></div><strong>{money(tab === "Receita Federal" ? totals.rfb : totals.pgfn)}</strong></div><div className="diag-filters"><label><Search size={16}/><input aria-label="Buscar débitos" placeholder="Buscar inscrição, tributo ou período" value={query} onChange={e => setQuery(e.target.value)}/></label><select aria-label="Filtrar situação da dívida" value={status} onChange={e => setStatus(e.target.value)}><option>Todas as situações</option>{[...new Set(report.debts.filter(d => d.origin === (tab === "Receita Federal" ? "RFB" : "PGFN")).map(d => d.status))].map(s => <option key={s}>{s}</option>)}</select></div><div className="diag-debt-table"><table><thead><tr><th>Inscrição / referência</th><th>Tributo</th><th>Período</th><th>Situação</th><th>Valor consolidado</th><th><span className="sr-only">Detalhes</span></th></tr></thead><tbody>{filtered.map(d => <tr key={d.id}><td>{d.id}</td><td>{d.tax}</td><td>{d.period}</td><td><span className={`diag-status ${d.status === "Ajuizada" ? "critical" : ""}`}>{d.status}</span></td><td><strong>{money(d.total)}</strong></td><td><button className="diag-icon-button" aria-label={`Ver detalhes ${d.id}`} onClick={() => setSelected(d)}><ChevronRight size={18}/></button></td></tr>)}</tbody></table></div><div className="diag-debt-cards">{filtered.map(d => <button key={d.id} className="diag-debt-card" onClick={() => setSelected(d)}><span>{d.id}<ChevronRight size={16}/></span><strong>{money(d.total)}</strong><span>{d.tax} · {d.period}</span><small>{d.status}</small></button>)}</div>{!filtered.length && <p className="diag-no-results">Nenhuma dívida corresponde aos filtros. <button onClick={() => { setQuery(""); setStatus("Todas as situações"); }}>Limpar filtros</button></p>}<div className="diag-list-foot">{filtered.length} de {report.debts.filter(d => d.origin === (tab === "Receita Federal" ? "RFB" : "PGFN")).length} registros · O PDF sempre inclui o relatório completo.</div></section>}
      {tab === "Estratégia" && <div className="diag-strategy"><section className="diag-card"><div className="diag-card-title"><h3>Capacidade de pagamento</h3><span className="diag-status pending">Demonstrativa</span></div><div className="diag-capag"><div><small>Classificação CAPAG</small><strong>{report.capag.rating ?? "Não informada"}</strong></div><div><small>Capacidade em 60 meses</small><strong>{money(report.capag.amount)}</strong></div></div><p>{report.capag.note}</p></section><section className="diag-card"><h3>Documentos e informações pendentes</h3><ul className="diag-checklist">{report.pending.map(item => <li key={item}><Clock3 size={17}/>{item}</li>)}</ul></section><section className="diag-card"><h3>Próximas ações</h3><ol className="diag-actions">{report.recommendations.map((item, i) => <li key={item}><span>0{i + 1}</span><p>{item}</p></li>)}</ol></section></div>}
      {tab === "Fontes" && <div className="diag-sources">{report.sources.map(source => <section className="diag-card" key={source.id}><div className="diag-card-title"><FileCheck2 size={23}/><span className={`diag-status ${source.status === "pendente" ? "pending" : ""}`}>{source.status === "pendente" ? "Pendente" : "Demonstrativo"}</span></div><h3>{source.title}</h3><p className="diag-source-provider">{source.provider}</p><p>{source.note}</p><div className="diag-source-date">{source.status === "pendente" ? "Documento não recebido" : `Referência do exemplo: ${date(source.collectedAt)}`}</div></section>)}<div className="diag-source-explainer"><ShieldCheck size={20}/><p>Na operação real, cada informação será vinculada ao documento ou retorno de consulta que a originou. Ausência de dados não significa ausência de dívida.</p></div></div>}
      {tab === "Parecer completo" && <><FiscalOpinion report={report}/><div className="op-download-tools"><button className="diag-button primary" onClick={download} disabled={pdfBusy}><ArrowDownToLine size={16}/>{pdfBusy ? "Gerando…" : "Baixar parecer em PDF"}</button><a className="diag-button" href="/api/diagnosticos/demo/pdf?inline=1" target="_blank" rel="noopener noreferrer">Abrir PDF para imprimir <ArrowRight size={16}/></a></div></>}

      </div>
    </>}
    <div className="diag-internal-note"><ShieldCheck size={15}/><span>Assistente WhatsApp de uso interno da equipe FS. Acesso por números autorizados.</span></div>
    <Sheet open={!!selected} onOpenChange={open => !open && setSelected(null)}><SheetContent className="diag-detail-sheet"><SheetHeader><SheetTitle>Detalhamento do débito</SheetTitle><SheetDescription>{selected?.id} · Registro demonstrativo</SheetDescription></SheetHeader>{selected && <div className="diag-detail-body"><div className="diag-detail-total"><small>{selected.origin} · {selected.tax}</small><strong>{money(selected.total)}</strong><span>{selected.status}</span></div><h3>Composição do valor</h3><dl>{[["Principal", selected.principal], ["Multa", selected.fine], ["Juros", selected.interest], ["Encargo", selected.charges]].map(([name, value]) => <div key={String(name)}><dt>{name}</dt><dd>{money(value as number | null)}</dd></div>)}</dl><h3>Identificação e origem</h3><dl>{[["Período", selected.period], ["Data de inscrição", selected.registeredAt], ["Processo administrativo", selected.administrativeProcess], ["Processo judicial", selected.judicialProcess], ["Fonte", selected.sourceId]].map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value ?? "Não informado"}</dd></div>)}</dl><p className="diag-detail-note"><Info size={16}/> Valores não informados permanecem em aberto. Eles não são tratados como zero.</p></div>}</SheetContent></Sheet>
  </div>;
}
