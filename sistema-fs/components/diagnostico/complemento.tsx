"use client";
import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Plus, X } from "lucide-react";
import { CompanyDocuments, type CompanyDoc } from "@/components/empresas/company-documents";
import { documentTypeLabel } from "@/lib/documentos/tipos";

// Complemento da análise: leitura da Receita Federal sem procuração e documentos anexados ao parecer.
export type DebtLine = { description: string; period: string; value: string };
export type Complement = { sitfis: boolean; rfb: { enabled: boolean; hasDebts: boolean; reference: string; note: string; total: string; count: string; lines: DebtLine[] }; annexIds: string[] };
export const emptyComplement = (): Complement => ({ sitfis: false, rfb: { enabled: false, hasDebts: true, reference: "", note: "", total: "", count: "", lines: [] }, annexIds: [] });
// "1.234,56" → 123456 centavos; vazio ou inválido → null.
export function brlCents(value: string): number | null {
  const clean = value.replace(/[R$\s]/g, ""); if (!clean) return null;
  const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100); return cents > 0 ? cents : null;
}
// Converte o formulário no corpo esperado pela API; devolve erro legível quando algo está incompleto.
export function complementPayload(c: Complement): { body: Record<string, unknown>; error?: string } {
  const body: Record<string, unknown> = { annexIds: c.annexIds };
  // Com procuração, a Receita vem do SITFIS; a leitura manual é ignorada.
  if (c.sitfis) return { body: { ...body, rfbSitfis: true } };
  if (!c.rfb.enabled) return { body };
  if (c.rfb.reference.trim().length < 3) return { body, error: "Informe de onde veio a leitura da Receita Federal (ex.: relatório de situação fiscal do cliente e a data)." };
  const lines = c.rfb.hasDebts ? c.rfb.lines.filter(l => l.description.trim() || l.value.trim()) : [];
  const items = lines.map(l => ({ description: l.description.trim(), period: l.period.trim(), total: brlCents(l.value) }));
  if (items.some(i => i.description.length < 2 || i.total === null)) return { body, error: "Cada débito da Receita precisa de descrição e valor (ex.: 12.345,67)." };
  const total = c.rfb.hasDebts && !items.length ? brlCents(c.rfb.total) : null;
  if (c.rfb.hasDebts && !items.length && c.rfb.total.trim() && total === null) return { body, error: "Valor total da Receita inválido. Use o formato 12.345,67." };
  const count = c.rfb.count.trim() ? Number(c.rfb.count) : null;
  if (count !== null && (!Number.isInteger(count) || count < 0)) return { body, error: "Quantidade de débitos inválida." };
  body.rfbManual = { hasDebts: c.rfb.hasDebts, reference: c.rfb.reference.trim(), ...(c.rfb.note.trim() ? { note: c.rfb.note.trim() } : {}), ...(items.length ? { items } : {}), ...(total ? { totalCents: total } : {}), ...(c.rfb.hasDebts && !items.length && count !== null ? { count } : {}) };
  return { body };
}
export function AnalysisComplement({ cnpj, value, onChange }: { cnpj: string; value: Complement; onChange: Dispatch<SetStateAction<Complement>> }) {
  const [docs, setDocs] = useState<CompanyDoc[]>([]);
  const seen = useRef(new Set<string>());
  const rfb = value.rfb, setRfb = (patch: Partial<Complement["rfb"]>) => onChange({ ...value, rfb: { ...rfb, ...patch } });
  const setLine = (i: number, patch: Partial<DebtLine>) => setRfb({ lines: rfb.lines.map((l, j) => j === i ? { ...l, ...patch } : l) });
  // Documentos novos entram marcados como anexo; pareceres anteriores nunca são anexados.
  const onDocs = useCallback((list: CompanyDoc[]) => {
    const eligible = list.filter(d => d.kind !== "parecer"), fresh = eligible.filter(d => !seen.current.has(d.id)).map(d => d.id);
    eligible.forEach(d => seen.current.add(d.id));
    setDocs(eligible);
    onChange(prev => ({ ...prev, annexIds: [...new Set([...prev.annexIds.filter(id => eligible.some(d => d.id === id)), ...fresh])] }));
  }, [onChange]);
  return (
    <div className="diag-complement">
      <section>
        <label className="diag-check"><input type="checkbox" checked={value.sitfis} onChange={e => onChange({ ...value, sitfis: e.target.checked })} /> <span><strong>Empresa com procuração para a FS</strong><small>Consultar a Situação Fiscal na Receita Federal pelo Serpro (consulta cobrada, feita uma vez). O preliminar sai na hora e a versão completa chega em alguns minutos.</small></span></label>
        {!value.sitfis && <>
        <label className="diag-check"><input type="checkbox" checked={rfb.enabled} onChange={e => setRfb({ enabled: e.target.checked })} /> <span><strong>Receita Federal sem procuração</strong><small>Informar a leitura feita pelo analista em documento do cliente. O parecer identifica que não foi coletada pelo sistema.</small></span></label>
        {rfb.enabled && (
          <div className="diag-complement-body">
            <div className="diag-radio">
              <label><input type="radio" name="rfb-has" checked={rfb.hasDebts} onChange={() => setRfb({ hasDebts: true })} /> Há débitos na Receita Federal</label>
              <label><input type="radio" name="rfb-has" checked={!rfb.hasDebts} onChange={() => setRfb({ hasDebts: false })} /> Não há débitos em cobrança</label>
            </div>
            <label className="diag-field">Fonte da leitura<input value={rfb.reference} maxLength={200} placeholder="Ex.: Relatório de Situação Fiscal entregue pelo cliente em 01/10/2026" onChange={e => setRfb({ reference: e.target.value })} /></label>
            {rfb.hasDebts && (
              <>
                {rfb.lines.map((line, i) => (
                  <div className="diag-debt-line" key={i}>
                    <input aria-label="Tributo ou descrição" placeholder="Tributo / descrição" maxLength={120} value={line.description} onChange={e => setLine(i, { description: e.target.value })} />
                    <input aria-label="Período" placeholder="Período" maxLength={40} value={line.period} onChange={e => setLine(i, { period: e.target.value })} />
                    <input aria-label="Valor" placeholder="Valor (R$)" inputMode="decimal" value={line.value} onChange={e => setLine(i, { value: e.target.value })} />
                    <button type="button" aria-label="Remover débito" onClick={() => setRfb({ lines: rfb.lines.filter((_, j) => j !== i) })}><X size={14} /></button>
                  </div>
                ))}
                <button type="button" className="diag-text-button" onClick={() => setRfb({ lines: [...rfb.lines, { description: "", period: "", value: "" }] })}><Plus size={14} /> Adicionar débito discriminado</button>
                {!rfb.lines.length && (
                  <div className="diag-debt-line two">
                    <label className="diag-field">Valor total (opcional)<input inputMode="decimal" placeholder="Ex.: 1.089.400,85" value={rfb.total} onChange={e => setRfb({ total: e.target.value })} /></label>
                    <label className="diag-field">Quantidade (opcional)<input inputMode="numeric" placeholder="Ex.: 18" value={rfb.count} onChange={e => setRfb({ count: e.target.value.replace(/\D/g, "") })} /></label>
                  </div>
                )}
              </>
            )}
            <label className="diag-field">Observação (opcional)<input value={rfb.note} maxLength={500} onChange={e => setRfb({ note: e.target.value })} /></label>
          </div>
        )}
        </>}
      </section>
      <section>
        <strong className="diag-complement-title">Documentos da empresa e anexos ao parecer</strong>
        <CompanyDocuments cnpj={cnpj} onChange={onDocs} />
        {docs.length > 0 && (
          <div className="diag-annex-list">
            <small>Anexar ao parecer ({value.annexIds.length} de {docs.length}):</small>
            {docs.map(d => <label key={d.id} className="diag-check small"><input type="checkbox" checked={value.annexIds.includes(d.id)} onChange={e => onChange({ ...value, annexIds: e.target.checked ? [...value.annexIds, d.id] : value.annexIds.filter(id => id !== d.id) })} /> <span>{d.name}<small>{documentTypeLabel(d.docType ?? d.kind)}</small></span></label>)}
          </div>
        )}
      </section>
    </div>
  );
}
