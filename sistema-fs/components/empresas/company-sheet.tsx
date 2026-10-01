"use client";
import { useState, type FormEvent } from "react";
import { Building2, ChevronRight, LoaderCircle, Pencil, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useController } from "@/components/controller/context";
import { formatCnpj, isValidCnpj, normalizeCnpj } from "@/lib/diagnostico/model";
import { formatDay, reviewLabels } from "@/lib/controller/model";
import type { Company } from "@/lib/empresas/store";
import { CompanyDocuments } from "./company-documents";

export function CompanySheet() {
  const { companySelected, openCompany, companies } = useController();
  const company = companySelected && companySelected !== "nova" ? companies.find(c => c.cnpj === companySelected) ?? null : null;
  return (
    <Sheet open={!!companySelected} onOpenChange={v => !v && openCompany(null)}>
      <SheetContent className="detail-sheet">
        <SheetHeader>
          <span className="eyebrow">ADMINISTRATIVO · CADASTRO</span>
          <SheetTitle>{company ? company.name : "Nova empresa"}</SheetTitle>
          <SheetDescription>{company ? `${formatCnpj(company.cnpj)}${company.registered ? "" : " · presente no Controller, sem cadastro próprio"}` : "A empresa cadastrada aqui passa a estar disponível para o Controller e para os documentos."}</SheetDescription>
        </SheetHeader>
        {companySelected && <CompanyPanel key={company ? `${company.cnpj}:${company.name}:${company.notes}` : "nova"} company={company} />}
      </SheetContent>
    </Sheet>
  );
}
function CompanyPanel({ company }: { company: Company | null }) {
  const { processes, allowed, reload, open, openCompany, notify } = useController();
  const [editing, setEditing] = useState(!company);
  const [name, setName] = useState(company?.name ?? "");
  const [cnpj, setCnpj] = useState(company ? formatCnpj(company.cnpj) : "");
  const [notes, setNotes] = useState(company?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const own = company ? processes.filter(p => p.cnpj === company.cnpj) : [];
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!isValidCnpj(normalizeCnpj(cnpj))) { setError("CNPJ inválido: os dois últimos dígitos não conferem com o número informado. Confira no cartão CNPJ."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/empresas", { method: company ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, cnpj, notes }) });
      if (response.status === 401) { window.location.assign("/login"); return; }
      const data = await response.json();
      if (!response.ok) { setError(data.message ?? "Não foi possível salvar."); return; }
      await reload(); notify(company ? "Empresa atualizada." : "Empresa cadastrada."); openCompany(data.company.cnpj);
    } catch { setError("Verifique sua conexão e tente novamente."); }
    finally { setBusy(false); }
  }
  return (
    <div className="sheet-body">
      {error && <p role="alert" className="ctrl-alert">{error}</p>}
      {editing ? (
        <form className="fs-form ctrl-form" onSubmit={save}>
          <div className="form-field"><Label htmlFor="empresa-nome">Razão social</Label><Input id="empresa-nome" required maxLength={200} value={name} onChange={e => setName(e.target.value)} /></div>
          <div className="form-field"><Label htmlFor="empresa-cnpj">CNPJ</Label><Input id="empresa-cnpj" required placeholder="00.000.000/0001-00" value={cnpj} readOnly={!!company} onChange={e => setCnpj(e.target.value)} /></div>
          <div className="form-field"><Label htmlFor="empresa-obs">Observações</Label><Textarea id="empresa-obs" maxLength={500} value={notes} onChange={e => setNotes(e.target.value)} /></div>
          <div className="ctrl-actions">
            <Button type="button" variant="outline" disabled={busy} onClick={() => company ? setEditing(false) : openCompany(null)}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />} {company ? "Salvar" : "Cadastrar empresa"}</Button>
          </div>
        </form>
      ) : company && (
        <>
          <div className="detail-grid">
            <div><small>Cadastro</small><strong>{company.registered ? `${company.createdBy} · ${formatDay(company.createdAt!.slice(0, 10))}` : "Só pelo Controller"}</strong></div>
            <div><small>Processos no Controller</small><strong>{own.length}</strong></div>
          </div>
          {company.notes && <p className="ctrl-notes">{company.notes}</p>}
          <div className="ctrl-actions">
            {allowed.edit && <Button variant="outline" onClick={() => setEditing(true)}><Pencil size={15} /> Editar</Button>}
            {allowed.create && <Button onClick={() => { openCompany(null); open({ novo: true, company: company.name, cnpj: company.cnpj }); }}><Plus size={16} /> Novo processo no Controller</Button>}
          </div>
          <h3>Documentação</h3>
          <CompanyDocuments cnpj={company.cnpj} />
          <h3>Processos</h3>
          {own.length ? <ul className="ctrl-files">{own.map(p => <li key={p.id}><Building2 size={15} /><button className="ctrl-link" onClick={() => { openCompany(null); open(p); }}>{p.processNumber || "sem nº"} · {p.dispatchStatus}</button><small>{reviewLabels[p.reviewState]}</small><ChevronRight size={14} /></li>)}</ul> : <p className="muted">Nenhum processo no Controller para esta empresa.</p>}
        </>
      )}
    </div>
  );
}
