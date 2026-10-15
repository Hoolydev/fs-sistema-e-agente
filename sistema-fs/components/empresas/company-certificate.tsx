"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { KeyRound, LoaderCircle, ShieldCheck, ShieldOff, TriangleAlert, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCnpj } from "@/lib/diagnostico/model";
import type { StoredCertificate } from "@/lib/certificados/store";

type State = { certificates: StoredCertificate[]; audit: { actor: string; action: string; detail: string; createdAt: string }[]; canManage: boolean; canUpload: boolean; vaultReady: boolean };
const day = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");
const actions: Record<string, string> = { enviado: "Enviado", substituido: "Substituído", revogado: "Revogado", entregue_ao_agente: "Usado pelo agente" };

// Certificado A1 (e-CNPJ) da empresa, guardado cifrado no cofre. A tela nunca recebe o arquivo nem a senha de volta.
export function CompanyCertificate({ cnpj }: { cnpj: string }) {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/certificados?cnpj=${cnpj}`, { cache: "no-store" }), data = await res.json();
      if (!res.ok) throw new Error(data.message || "Não foi possível consultar o certificado.");
      setState(data); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Falha na conexão."); }
  }, [cnpj]);
  useEffect(() => { const t = setTimeout(() => void load(), 0); return () => clearTimeout(t); }, [load]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget); data.set("cnpj", cnpj);
    setBusy(true); setError(""); setNotice("");
    try {
      const res = await fetch("/api/certificados", { method: "POST", body: data }), body = await res.json();
      if (!res.ok) throw new Error(body.message || "Não foi possível guardar o certificado.");
      form.current?.reset(); setAdding(false); setNotice("Certificado conferido e guardado cifrado no cofre."); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível guardar o certificado."); }
    finally { setBusy(false); }
  }
  async function revoke(id: string) {
    if (!window.confirm("Revogar este certificado? O arquivo cifrado é apagado do cofre e o agente deixa de poder usá-lo.")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const res = await fetch(`/api/certificados?id=${id}`, { method: "DELETE" }), body = await res.json();
      if (!res.ok) throw new Error(body.message || "Não foi possível revogar.");
      setNotice("Certificado revogado e apagado do cofre."); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível revogar."); }
    finally { setBusy(false); }
  }

  if (!state) return error ? <p role="alert" className="ctrl-alert">{error}</p> : <p className="muted">Consultando o certificado…</p>;
  const active = state.certificates.find(c => c.active);
  return (
    <div className="cert-box">
      {error && <p role="alert" className="ctrl-alert">{error}</p>}
      {notice && <p role="status" className="cert-notice">{notice}</p>}
      {active ? (
        <div className={`cert-card ${active.daysLeft < 0 ? "late" : active.daysLeft <= 30 ? "warn" : ""}`}>
          <ShieldCheck size={20} />
          <div>
            <strong>{active.holder}</strong>
            <small>e-CNPJ {active.certCnpj ? formatCnpj(active.certCnpj) : "—"} · emitido por {active.issuer}</small>
            <small>
              {active.daysLeft < 0 ? `Venceu em ${day(active.notAfter)}` : `Válido até ${day(active.notAfter)}${active.daysLeft <= 30 ? ` · vence em ${active.daysLeft} dias` : ""}`}
              {" · "}enviado por {active.createdBy} em {day(active.createdAt)}
            </small>
          </div>
          {state.canManage && <Button variant="outline" size="sm" disabled={busy} onClick={() => void revoke(active.id)}><ShieldOff size={14} /> Revogar</Button>}
        </div>
      ) : <p className="muted">Nenhum certificado guardado para esta empresa.</p>}
      {state.canUpload && (adding ? (
        <form ref={form} className="cert-form" onSubmit={upload} autoComplete="off">
          <p className="cert-hint"><KeyRound size={14} /> O arquivo e a senha são conferidos e guardados cifrados; só o agente da FS consegue abri-los. Tenha o termo do cliente autorizando a FS a guardar e usar o certificado.</p>
          <div className="form-field"><Label htmlFor={`cert-file-${cnpj}`}>Certificado A1 (.pfx ou .p12)</Label><Input id={`cert-file-${cnpj}`} name="file" type="file" accept=".pfx,.p12,application/x-pkcs12" required disabled={busy} /></div>
          <div className="form-field"><Label htmlFor={`cert-pass-${cnpj}`}>Senha do certificado</Label><Input id={`cert-pass-${cnpj}`} name="password" type="password" required maxLength={128} autoComplete="new-password" disabled={busy} /></div>
          <div className="ctrl-actions">
            <Button type="button" variant="outline" disabled={busy} onClick={() => { setAdding(false); form.current?.reset(); }}>Cancelar</Button>
            <Button type="submit" disabled={busy || !state.vaultReady}>{busy ? <LoaderCircle className="spin" size={15} /> : <Upload size={15} />} Conferir e guardar</Button>
          </div>
          {!state.vaultReady && <p className="cert-hint"><TriangleAlert size={14} /> O cofre ainda não está configurado no sistema.</p>}
        </form>
      ) : <Button variant="outline" onClick={() => { setAdding(true); setNotice(""); }}><KeyRound size={15} /> {active ? "Substituir certificado" : "Guardar certificado A1"}</Button>)}
      {state.canManage && state.audit.length > 0 && (
        <details className="cert-audit">
          <summary>Histórico de uso ({state.audit.length})</summary>
          <ul>{state.audit.map((a, i) => <li key={i}><span>{day(a.createdAt)} {new Date(a.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span> {actions[a.action] ?? a.action} · {a.actor}{a.detail ? ` · ${a.detail}` : ""}</li>)}</ul>
        </details>
      )}
    </div>
  );
}
