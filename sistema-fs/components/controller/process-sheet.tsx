"use client";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Check, LoaderCircle, Pencil, RotateCcw, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/fs/primitives";
import { formatCnpj } from "@/lib/diagnostico/model";
import { DEADLINE_DAYS, addDays, admStatusOptions, dispatchOptions, fieldLabels, formatDay, objectOptions, reviewLabels, today, type AuditEntry, type ControllerProcess, type ProcessInput } from "@/lib/controller/model";
import { useController, type NewProcess } from "./context";
import { CompanyDocuments } from "@/components/empresas/company-documents";

type Draft = Record<keyof ProcessInput, string>;
const blank = (prefill?: NewProcess): Draft => ({ company: prefill?.company ?? "", cnpj: prefill?.cnpj ? formatCnpj(prefill.cnpj) : "", object: objectOptions[0], admStatus: admStatusOptions[0], protocolDate: "", deadline: "", processNumber: "", updatedOn: today(), dispatchStatus: dispatchOptions[0], notes: "" });
const draftOf = (p: ControllerProcess): Draft => ({ company: p.company, cnpj: formatCnpj(p.cnpj), object: p.object, admStatus: p.admStatus, protocolDate: p.protocolDate ?? "", deadline: p.deadline ?? "", processNumber: p.processNumber, updatedOn: p.updatedOn ?? "", dispatchStatus: p.dispatchStatus, notes: p.notes });
const moment = (iso: string | null) => iso ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(iso)) : "—";

export function ProcessSheet() {
  const { selected, open, allowed } = useController();
  const process = selected && selected !== "novo" && !("novo" in selected) ? selected : null;
  const prefill = selected && selected !== "novo" && "novo" in selected ? selected : undefined;
  return (
    <Sheet open={!!selected} onOpenChange={v => !v && open(null)}>
      <SheetContent className="detail-sheet">
        <SheetHeader>
          <span className="eyebrow">CONTROLLER · GESTÃO DE PROCESSOS</span>
          <SheetTitle>{process ? process.company : "Novo processo"}</SheetTitle>
          <SheetDescription>{process ? `${formatCnpj(process.cnpj)} · ${process.processNumber || "sem nº de processo"}` : allowed.review ? "O registro entra como revisado por você." : "O registro será enviado para revisão antes de valer como revisado."}</SheetDescription>
        </SheetHeader>
        {/* A chave reinicia formulário e mensagens ao trocar de registro ou quando ele muda de versão. */}
        {selected && <ProcessPanel key={process ? `${process.id}:${process.updatedAt}` : `novo:${prefill?.cnpj ?? ""}`} process={process} prefill={prefill} />}
      </SheetContent>
    </Sheet>
  );
}
function ProcessPanel({ process, prefill }: { process: ControllerProcess | null; prefill?: NewProcess }) {
  const { open, reload, allowed, processes, companies, notify } = useController();
  const [editing, setEditing] = useState(!process);
  const [draft, setDraft] = useState<Draft>(() => process ? draftOf(process) : blank(prefill));
  const [history, setHistory] = useState<AuditEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [invalid, setInvalid] = useState<string[]>([]);
  const [adjusting, setAdjusting] = useState(false);
  const [note, setNote] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const id = process?.id;
  useEffect(() => {
    if (!id) return;
    let active = true;
    fetch(`/api/controller/processos/${id}`, { cache: "no-store" }).then(r => r.ok ? r.json() : { history: [] }).then(d => { if (active) setHistory(d.history ?? []); }).catch(() => {});
    return () => { active = false; };
  }, [id]);
  const suggestions = useMemo(() => ({
    object: [...new Set([...objectOptions, ...processes.map(p => p.object)])], admStatus: [...new Set([...admStatusOptions, ...processes.map(p => p.admStatus)])], dispatchStatus: [...new Set([...dispatchOptions, ...processes.map(p => p.dispatchStatus)])],
  }), [processes]);
  const set = (key: keyof Draft, value: string) => setDraft(d => {
    const next = { ...d, [key]: value };
    // Empresa escolhida do cadastro preenche o CNPJ.
    if (key === "company") { const known = companies.find(c => c.name === value.trim().toUpperCase()); if (known) next.cnpj = formatCnpj(known.cnpj); }
    // Contagem acompanha o protocolo enquanto ninguém a ajustar manualmente.
    if (key === "protocolDate" && value && (!d.deadline || (d.protocolDate && d.deadline === addDays(d.protocolDate, DEADLINE_DAYS)))) next.deadline = addDays(value, DEADLINE_DAYS);
    return next;
  });
  async function send(url: string, method: string, body?: unknown) {
    setBusy(true); setError(""); setInvalid([]);
    try {
      const response = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      if (response.status === 401) { window.location.assign("/login"); return null; }
      const data = await response.json();
      if (!response.ok) { setError(data.message ?? "Não foi possível concluir a operação."); setInvalid(data.fields ?? []); if (response.status === 409) void reload(); return null; }
      await reload(); return data as { process?: ControllerProcess };
    } catch { setError("Verifique sua conexão e tente novamente."); return null; }
    finally { setBusy(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    const data = process ? await send(`/api/controller/processos/${process.id}`, "PATCH", { ...draft, version: process.updatedAt }) : await send("/api/controller/processos", "POST", draft);
    if (!data?.process) return;
    notify(data.process.reviewState === "pendente" ? "Registro salvo e enviado para revisão." : "Registro salvo.");
    open(data.process);
  }
  async function decide(decision: "aprovar" | "ajustes") {
    if (!process) return;
    const data = await send(`/api/controller/processos/${process.id}/revisao`, "POST", { decision, note, version: process.updatedAt });
    if (!data?.process) return;
    notify(decision === "aprovar" ? "Registro aprovado." : "Ajustes solicitados a quem incluiu o registro.");
    open(data.process);
  }
  async function remove() {
    if (!process || !await send(`/api/controller/processos/${process.id}`, "DELETE")) return;
    notify("Registro excluído."); open(null);
  }
  const field = (key: keyof Draft, props: { type?: string; list?: string[]; required?: boolean; placeholder?: string } = {}) => (
    <div className="form-field" key={key}>
      <Label htmlFor={`processo-${key}`}>{fieldLabels[key]}</Label>
      <Input id={`processo-${key}`} type={props.type ?? "text"} required={props.required} placeholder={props.placeholder} autoComplete="off" value={draft[key]} aria-invalid={invalid.includes(key) || undefined} list={props.list ? `processo-${key}-opcoes` : undefined} onChange={e => set(key, e.target.value)} />
      {props.list && <datalist id={`processo-${key}-opcoes`}>{props.list.map(o => <option key={o} value={o} />)}</datalist>}
    </div>
  );
  return (
    <div className="sheet-body">
      {error && <p role="alert" className="ctrl-alert">{error}</p>}
      {editing ? (
        <form className="fs-form ctrl-form" onSubmit={save}>
          {field("company", { required: true, placeholder: "Razão social", list: companies.map(c => c.name) })}
          {field("cnpj", { required: true, placeholder: "00.000.000/0001-00" })}
          {field("object", { required: true, list: suggestions.object })}
          {field("admStatus", { required: true, list: suggestions.admStatus })}
          <div className="ctrl-form-row">{field("protocolDate", { type: "date" })}{field("deadline", { type: "date" })}</div>
          {field("processNumber", { placeholder: "00000.000000/0000-00" })}
          <div className="ctrl-form-row">{field("dispatchStatus", { required: true, list: suggestions.dispatchStatus })}{field("updatedOn", { type: "date" })}</div>
          <div className="form-field"><Label htmlFor="processo-notes">{fieldLabels.notes}</Label><Textarea id="processo-notes" maxLength={1000} value={draft.notes} onChange={e => set("notes", e.target.value)} /></div>
          {!allowed.review && <p className="ctrl-hint">Ao salvar, o registro fica <strong>aguardando revisão</strong> de um revisor.</p>}
          <div className="ctrl-actions">
            <Button type="button" variant="outline" disabled={busy} onClick={() => process ? (setEditing(false), setDraft(draftOf(process)), setError("")) : open(null)}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />} Salvar</Button>
          </div>
        </form>
      ) : process && (
        <>
          <div className="ctrl-badges"><Badge>{reviewLabels[process.reviewState]}</Badge><Badge>{process.dispatchStatus}</Badge><Badge>{process.admStatus}</Badge></div>
          {process.reviewState === "ajustes" && <p className="ctrl-alert"><strong>Ajuste solicitado por {process.reviewedBy}:</strong> {process.reviewNote}</p>}
          <div className="detail-grid">
            <div><small>{fieldLabels.object}</small><strong>{process.object}</strong></div>
            <div><small>{fieldLabels.processNumber}</small><strong>{process.processNumber || "—"}</strong></div>
            <div><small>{fieldLabels.protocolDate}</small><strong>{formatDay(process.protocolDate)}</strong></div>
            <div><small>{fieldLabels.deadline}</small><strong>{formatDay(process.deadline)}</strong></div>
            <div><small>{fieldLabels.updatedOn}</small><strong>{formatDay(process.updatedOn)}</strong></div>
            <div><small>Revisão</small><strong>{process.reviewedBy ? `${process.reviewedBy} · ${moment(process.reviewedAt)}` : "Ainda não revisado"}</strong></div>
          </div>
          <h3>{fieldLabels.notes}</h3>
          <p className="ctrl-notes">{process.notes || "Sem observações."}</p>
          {adjusting ? (
            <div className="fs-form ctrl-form">
              <div className="form-field"><Label htmlFor="processo-ajuste">O que precisa ser ajustado?</Label><Textarea id="processo-ajuste" maxLength={500} value={note} onChange={e => setNote(e.target.value)} autoFocus /></div>
              <div className="ctrl-actions"><Button variant="outline" disabled={busy} onClick={() => setAdjusting(false)}>Cancelar</Button><Button disabled={busy || note.trim().length < 3} onClick={() => void decide("ajustes")}><RotateCcw size={15} /> Enviar pedido</Button></div>
            </div>
          ) : (
            <div className="ctrl-actions">
              {allowed.edit && <Button variant="outline" disabled={busy} onClick={() => setEditing(true)}><Pencil size={15} /> Editar</Button>}
              {allowed.review && process.reviewState === "pendente" && <Button variant="outline" disabled={busy} onClick={() => setAdjusting(true)}><RotateCcw size={15} /> Pedir ajustes</Button>}
              {allowed.review && process.reviewState !== "aprovado" && <Button disabled={busy} onClick={() => void decide("aprovar")}><Check size={16} /> Aprovar</Button>}
            </div>
          )}
          <h3>Documentos da empresa</h3>
          <CompanyDocuments cnpj={process.cnpj} />
          <h3>Histórico</h3>
          <div className="timeline">
            {history.map(h => <div key={h.id}><i /><strong>{h.actor} {h.action}</strong>{h.detail && <p>{h.detail}</p>}<small>{moment(h.createdAt)}</small></div>)}
            {!history.length && <p className="muted">Sem movimentações registradas.</p>}
          </div>
          <p className="ctrl-hint">Incluído por {process.createdBy} em {moment(process.createdAt)}.</p>
          {allowed.remove && (confirmDelete
            ? <div className="ctrl-actions"><Button variant="outline" disabled={busy} onClick={() => setConfirmDelete(false)}>Manter registro</Button><Button variant="destructive" disabled={busy} onClick={() => void remove()}><Trash2 size={15} /> Confirmar exclusão</Button></div>
            : <button className="ctrl-delete" onClick={() => setConfirmDelete(true)}><Trash2 size={14} /> Excluir registro</button>)}
        </>
      )}
    </div>
  );
}
