"use client";

import { useState, type FormEvent } from "react";
import { DocumentLibrary } from "@/components/documentos/library";
import { Building2, Info, LoaderCircle, Search, ShieldCheck, X } from "lucide-react";
import { isValidCnpj, normalizeCnpj } from "@/lib/diagnostico/model";


export default function DiagnosticWorkspace() {
  const [cnpj, setCnpj] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [reusedUrl, setReusedUrl] = useState("");
  async function consult(event: FormEvent | null, force = false) {
    event?.preventDefault();
    if (!isValidCnpj(cnpj)) { setError("Confira o CNPJ informado. Os dígitos verificadores não são válidos."); return; }
    setLoading(true); setError(""); setReusedUrl("");
    try {
      const response = await fetch("/api/diagnosticos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cnpj: normalizeCnpj(cnpj), ...(force ? { force: true } : {}) }) });
      if (response.status === 401) { window.location.assign("/login"); return; }
      const data = await response.json();
      if (response.ok && typeof data.reportUrl === "string" && data.reportUrl.startsWith("/diagnostico/")) {
        if (data.reused) { setReusedUrl(data.reportUrl); setError(data.message ?? "Já existe um diagnóstico recente deste CNPJ."); setLoading(false); return; }
        window.location.assign(data.reportUrl); return;
      }
      setError(data.message ?? "A consulta não retornou um diagnóstico. Tente novamente mais tarde.");
    } catch { setError("Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente."); }
    setLoading(false);
  }

  return <div className="diagnostic">
    <div className="diag-heading diag-hero"><div><p className="diag-eyebrow">INTELIGÊNCIA TRIBUTÁRIA</p><h1>Diagnóstico da empresa</h1><p>Do levantamento dos débitos à próxima decisão.</p></div><span className="diag-chip"><span /> Consulta preliminar: PGFN + cadastro · RFB exige procuração</span></div>
    <form className="diag-search" onSubmit={consult}>
      <div className="diag-search-label"><Building2 size={21}/><div><label htmlFor="analysis-cnpj">Analisar uma empresa</label><small>Informe o CNPJ do lead. A dívida ativa (PGFN) e o cadastro são consultados agora; a Situação Fiscal RFB depende de procuração no e-CAC.</small></div></div>
      <div className="diag-search-controls"><input id="analysis-cnpj" value={cnpj} onChange={e => { setCnpj(e.target.value); setError(""); }} placeholder="00.000.000/0001-00" maxLength={18} autoComplete="off" aria-describedby={error ? "diagnostic-error" : undefined}/><button className="diag-button primary" disabled={loading} type="submit">{loading ? <LoaderCircle className="spin" size={16}/> : <Search size={16}/>} {loading ? "Consultando PGFN…" : "Analisar CNPJ"}</button></div>
    </form>
    <DocumentLibrary compact/>
    {error && <div role="alert" className="diag-alert" id="diagnostic-error"><Info size={19}/><p>{error}{reusedUrl && <> <a href={reusedUrl}>Abrir parecer arquivado</a> · <button className="diag-text-button" style={{ display: "inline" }} onClick={() => void consult(null, true)} disabled={loading}>Emitir nova versão (nova consulta PGFN)</button></>}</p><button onClick={() => { setError(""); setReusedUrl(""); }} aria-label="Fechar aviso"><X size={16}/></button></div>}
    <div className="diag-internal-note"><ShieldCheck size={15}/><span>Assistente WhatsApp de uso interno da equipe FS. Acesso por números autorizados.</span></div>
  </div>;
}
