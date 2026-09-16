import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import Dashboard from '@/components/fs/dashboard';
import { FiscalOpinion } from '@/components/diagnostico/fiscal-opinion';
import { getAuth } from '@/lib/auth/server';
import { savedReport } from '@/lib/diagnostico/store';
import { auditDocument } from '@/lib/documentos/store';
import { formatCnpj, money, summarize } from '@/lib/diagnostico/model';

export const dynamic = 'force-dynamic';
export default async function SavedDiagnosticPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const { id } = await params;
  const report = await savedReport(id);
  if (!report) notFound();
  await auditDocument(session.user.id, 'view-report', id);
  const totals = summarize(report);
  return <Dashboard screen="diagnostico"><div className="diagnostic">
    <Link className="diag-text-button" href="/diagnostico">← Voltar ao acervo</Link>
    <div className="diag-heading"><div><p className="diag-eyebrow">PARECER FS · DOCUMENTO SALVO</p><h1>{report.company.name}</h1><p>{formatCnpj(report.company.cnpj)} · Versão {report.version} · Data-base {new Date(report.generatedAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p></div></div>
    <div className="diag-company-actions"><a className="diag-button primary" href={`/api/documentos/${id}?download=1`}>Baixar parecer FS em PDF</a><a className="diag-button" href={`/api/documentos/${id}`} target="_blank" rel="noopener noreferrer">Abrir PDF para imprimir</a></div>
    <div className="diag-kpis"><div className="diag-kpi debt-total"><div>Total em cobrança</div><strong>{money(totals.total)}</strong><small>Recorte das fontes na data-base</small></div><div className="diag-kpi"><div>Dívida ativa · PGFN</div><strong>{money(totals.pgfn)}</strong><small>{totals.count} inscrições incluídas</small></div><div className="diag-kpi"><div>Receita Federal</div><strong>{money(totals.rfb)}</strong><small>Valores a vencer apresentados separadamente</small></div></div>
    <section className="diag-card"><h2>Síntese do levantamento</h2><p>{report.summary}</p><p>Documento para revisão técnica. Reabrir e baixar este parecer reutiliza a versão arquivada, sem nova consulta fiscal.</p></section>
    <FiscalOpinion report={report}/>
  </div></Dashboard>;
}
