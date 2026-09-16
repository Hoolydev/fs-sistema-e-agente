"use client";
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { Search, FileText, ArrowUpRight, Download, FolderOpen, LoaderCircle, RefreshCw } from 'lucide-react';
import type { StoredDocument } from '@/lib/documentos/store';
import { groupDocuments, preferredDocument, type CompanyDocuments } from '@/lib/documentos/groups';
import { formatCnpj } from '@/lib/diagnostico/model';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';

const date = (v: string) => new Date(v).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
function FileOptions({ group }: { group: CompanyDocuments }) {
  return <>{[{ kind: 'parecer', label: 'Pareceres FS' }, { kind: 'documento', label: 'Documentos de apoio / Serpro' }].map(({ kind, label }) => {
    const files = group.documents.filter(d => kind === 'parecer' ? d.kind === 'parecer' : d.kind !== 'parecer');
    return files.length ? <optgroup key={kind} label={label}>{files.map(d => <option key={d.id} value={d.id}>{d.name} · {date(d.createdAt)}</option>)}</optgroup> : null;
  })}</>;
}
export function DocumentLibrary({ compact = false }: { compact?: boolean }) {
  const [query, setQuery] = useState(''), [appliedQuery, setAppliedQuery] = useState('');
  const [items, setItems] = useState<StoredDocument[]>([]), [loading, setLoading] = useState(true);
  const [error, setError] = useState(''), [refreshKey, setRefreshKey] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [previewCompany, setPreviewCompany] = useState<string | null>(null);
  useEffect(() => {
    let disposed = false, controller: AbortController | undefined;
    async function refresh() {
      controller?.abort();
      const active = new AbortController(); controller = active;
      try {
        const response = await fetch(`/api/documentos?q=${encodeURIComponent(appliedQuery)}`, { signal: active.signal, cache: 'no-store' });
        if (response.status === 401) { window.location.assign('/login'); return; }
        if (!response.ok) throw new Error('library_unavailable');
        const data = await response.json();
        if (disposed || active.signal.aborted) return;
        setItems(data.documents); setError(''); setUpdatedAt(new Date());
      } catch {
        if (!disposed && !active.signal.aborted) setError('Não foi possível atualizar o acervo. Tentaremos novamente automaticamente.');
      } finally { if (!disposed && !active.signal.aborted) setLoading(false); }
    }
    const whenVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    void refresh();
    const timer = window.setInterval(whenVisible, 15000);
    window.addEventListener('focus', whenVisible); window.addEventListener('online', whenVisible);
    document.addEventListener('visibilitychange', whenVisible);
    return () => { disposed = true; controller?.abort(); window.clearInterval(timer); window.removeEventListener('focus', whenVisible); window.removeEventListener('online', whenVisible); document.removeEventListener('visibilitychange', whenVisible); };
  }, [appliedQuery, refreshKey]);
  function search(event: FormEvent) { event.preventDefault(); setLoading(true); setAppliedQuery(query.trim()); setRefreshKey(k => k + 1); }
  function select(cnpj: string, id: string) { setSelection(previous => ({ ...previous, [cnpj]: id })); }
  const groups = groupDocuments(items);
  const previewGroup = groups.find(g => g.cnpj === previewCompany);
  const preview = previewGroup ? preferredDocument(previewGroup, selection[previewGroup.cnpj]) : null;
  return <section className="diag-card fs-library">
    <div className="diag-card-title"><div><span className="diag-eyebrow">ACERVO POR EMPRESA</span><h2>{compact ? 'Diagnósticos e arquivos dos clientes' : 'Documentos da equipe'}</h2><p>Pareceres FS, versões anteriores e documentos Serpro reunidos pelo CNPJ.</p></div><FolderOpen size={25}/></div>
    <form onSubmit={search} className="fs-library-search"><label><Search size={18}/><input aria-label="Buscar documentos por empresa ou CNPJ" placeholder="Nome da empresa ou CNPJ" value={query} onChange={e => setQuery(e.target.value)}/></label><button className="diag-button primary" disabled={loading}>Buscar</button></form>
    <div className="fs-library-sync"><span role="status"><RefreshCw size={13}/> {updatedAt ? `Atualizado às ${updatedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · atualização automática` : 'Conectando ao acervo…'}</span><button type="button" onClick={() => setRefreshKey(k => k + 1)} aria-label="Atualizar acervo agora">Atualizar agora</button></div>
    {error && <p role="alert" className="diag-alert">{error}</p>}
    {loading ? <p className="fs-library-empty"><LoaderCircle className="spin" size={18}/> Carregando acervo…</p> : !groups.length ? <div className="fs-library-empty"><FileText size={25}/><p>Nenhuma empresa encontrada. Pareceres e documentos arquivados aparecerão aqui automaticamente.</p></div> : <div className="fs-company-list">{groups.map(group => {
      const selected = preferredDocument(group, selection[group.cnpj]);
      const opinions = group.documents.filter(d => d.kind === 'parecer').length, sources = group.documents.length - opinions;
      return <article className="fs-company-card" key={group.cnpj}>
        <div className="fs-company-heading"><div className="fs-library-icon"><FolderOpen size={22}/></div><div><h3>{group.name}</h3><p>{formatCnpj(group.cnpj)}</p></div></div>
        <div className="fs-company-counts"><span>{opinions} parecer{opinions === 1 ? '' : 'es'} FS</span><span>{sources} documento{sources === 1 ? '' : 's'} de apoio</span></div>
        <div className="fs-file-picker"><label htmlFor={`file-${group.cnpj}`}>Escolha o parecer ou documento</label><select id={`file-${group.cnpj}`} value={selected.id} onChange={e => select(group.cnpj, e.target.value)}><FileOptions group={group}/></select></div>
        <div className="fs-company-file"><div><strong>{selected.kind === 'parecer' ? 'Parecer FS' : 'Documento de apoio'}</strong><p>{selected.name}</p><small>{date(selected.createdAt)} · {selected.source}</small></div><div className="fs-company-actions">{selected.reportUrl && <Link className="diag-button primary" href={selected.reportUrl}>Ver diagnóstico <ArrowUpRight size={15}/></Link>}<button className="diag-button fs-pdf-desktop" onClick={() => setPreviewCompany(group.cnpj)}>Visualizar PDF</button><a className="diag-button fs-pdf-external" href={`/api/documentos/${selected.id}`} target="_blank" rel="noopener noreferrer">Abrir PDF <ArrowUpRight size={15}/></a><a className="diag-button" href={`/api/documentos/${selected.id}?download=1`} target="_blank" rel="noopener noreferrer" aria-label={`Baixar ${selected.name}`}><Download size={16}/></a></div></div>
      </article>;
    })}</div>}
    <div className="fs-library-foot"><span>{groups.length} empresa{groups.length === 1 ? '' : 's'} · {items.length} arquivo{items.length === 1 ? '' : 's'}</span>{compact && <Link href="/documentos">Ver acervo completo <ArrowUpRight size={14}/></Link>}</div>
    <Sheet open={!!preview} onOpenChange={open => !open && setPreviewCompany(null)}><SheetContent className="fs-document-preview"><SheetHeader><SheetTitle>{previewGroup?.name}</SheetTitle><SheetDescription>Escolha entre os pareceres e documentos desta empresa.</SheetDescription></SheetHeader>{preview && previewGroup && <><div className="fs-preview-controls"><label htmlFor="preview-file">Arquivo</label><select id="preview-file" value={preview.id} onChange={e => select(previewGroup.cnpj, e.target.value)}><FileOptions group={previewGroup}/></select><div className="fs-company-actions">{preview.reportUrl && <Link className="diag-button primary" href={preview.reportUrl}>Ver diagnóstico</Link>}<a className="diag-button" href={`/api/documentos/${preview.id}`} target="_blank" rel="noopener noreferrer">Abrir PDF <ArrowUpRight size={15}/></a><a className="diag-button" href={`/api/documentos/${preview.id}?download=1`} target="_blank" rel="noopener noreferrer">Baixar PDF</a></div></div><iframe key={preview.id} src={`/api/documentos/${preview.id}`} title={`PDF: ${preview.name}`} className="fs-pdf-frame"/></>}</SheetContent></Sheet>
  </section>;
}
