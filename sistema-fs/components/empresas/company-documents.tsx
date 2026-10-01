"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, CircleDashed, FileText, LoaderCircle, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useController } from "@/components/controller/context";
import { formatDay } from "@/lib/controller/model";
import { documentChecklist, documentTypeLabel, documentTypes, type DocumentTypeId } from "@/lib/documentos/tipos";

type Doc = { id: string; name: string; kind: string; createdAt: string; docType?: string | null; source: string };
async function loadDocuments(cnpj: string): Promise<Doc[]> {
  const r = await fetch(`/api/documentos?q=${cnpj}`, { cache: "no-store" });
  const d = r.ok ? await r.json() : { documents: [] };
  return (d.documents ?? []).filter((f: { cnpj: string }) => f.cnpj === cnpj);
}
// Pelo nome do arquivo, sugere o tipo; a pessoa confirma antes de enviar.
function guessType(name: string): DocumentTypeId {
  const n = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/cnpj/.test(n)) return "cartao_cnpj"; if (/contrato/.test(n)) return "contrato_social"; if (/procura/.test(n)) return "procuracao";
  if (/traslado|cessao/.test(n)) return "traslado_cessao"; if (/ouricuri/.test(n)) return "certidao_ouricuri"; if (/transito/.test(n)) return "certidao_transito";
  if (/rg|cnh|cpf|identidade|pessoal/.test(n)) return "documento_pessoal"; if (/comprovante|pix|boleto|pagamento/.test(n)) return "comprovante";
  return "outro";
}
// Checklist da documentação da empresa, arquivos arquivados e envio de vários arquivos de uma vez.
export function CompanyDocuments({ cnpj, onChange }: { cnpj: string; onChange?: (docs: Doc[]) => void }) {
  const { allowed, notify } = useController();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [files, setFiles] = useState<{ file: File; type: DocumentTypeId }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => { const list = await loadDocuments(cnpj).catch(() => []); setDocs(list); onChange?.(list); }, [cnpj, onChange]);
  useEffect(() => { let active = true; loadDocuments(cnpj).then(list => { if (active) { setDocs(list); onChange?.(list); } }).catch(() => {}); return () => { active = false; }; }, [cnpj, onChange]);
  async function send() {
    if (!files.length) return;
    setBusy(true); setError("");
    const form = new FormData(); form.set("cnpj", cnpj); form.set("kind", "documento");
    for (const f of files) { form.append("files", f.file); form.append("types", f.type); }
    try {
      const response = await fetch("/api/documentos", { method: "POST", body: form });
      if (response.status === 401) { window.location.assign("/login"); return; }
      const data = await response.json();
      if (!response.ok && !data.saved?.length) { setError(data.message || "Não foi possível enviar."); return; }
      notify(`${data.saved.length} arquivo${data.saved.length === 1 ? "" : "s"} arquivado${data.saved.length === 1 ? "" : "s"}.`); if (data.message) setError(data.message);
      setFiles([]); await refresh();
    } catch { setError("Verifique sua conexão e tente novamente."); }
    finally { setBusy(false); }
  }
  const checklist = documentChecklist(docs);
  return (
    <div className="docs-panel">
      <ul className="docs-checklist">
        {checklist.map(item => { const file = docs.find(d => d.docType === item.id); return (
          <li key={item.id} className={item.done ? "done" : ""}>{item.done ? <Check size={15} /> : <CircleDashed size={15} />}<span>{item.label}</span>{file ? <a href={`/api/documentos/${file.id}`} target="_blank" rel="noreferrer">abrir</a> : <small>pendente</small>}</li>
        ); })}
      </ul>
      {docs.length ? <ul className="ctrl-files">{docs.map(f => <li key={f.id}><FileText size={15} /><a href={`/api/documentos/${f.id}`} target="_blank" rel="noreferrer">{f.name}</a><small>{documentTypeLabel(f.docType ?? (f.kind === "parecer" ? "parecer" : null))} · {formatDay(f.createdAt.slice(0, 10))}</small></li>)}</ul> : <p className="muted">Nenhum arquivo arquivado para este CNPJ.</p>}
      {allowed.create && (
        <div className="docs-upload">
          <label className="docs-pick"><Upload size={15} /> Selecionar arquivos (PDF, JPG ou PNG, até 3 MB cada)<input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={e => { const chosen = [...(e.target.files ?? [])].slice(0, 10).map(file => ({ file, type: guessType(file.name) })); setFiles(prev => [...prev, ...chosen].slice(0, 10)); e.target.value = ""; }} /></label>
          {files.map((f, i) => (
            <div className="docs-file" key={`${f.file.name}-${i}`}>
              <span title={f.file.name}>{f.file.name}</span>
              <select aria-label={`Tipo de ${f.file.name}`} value={f.type} onChange={e => setFiles(files.map((x, j) => j === i ? { ...x, type: e.target.value as DocumentTypeId } : x))}>{documentTypes.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
              <button type="button" aria-label={`Remover ${f.file.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}><X size={14} /></button>
            </div>
          ))}
          {files.length > 0 && <Button disabled={busy} onClick={() => void send()}>{busy ? <LoaderCircle className="spin" size={16} /> : <Upload size={16} />} Enviar {files.length} arquivo{files.length === 1 ? "" : "s"}</Button>}
          {error && <p className="ctrl-alert">{error}</p>}
        </div>
      )}
    </div>
  );
}
