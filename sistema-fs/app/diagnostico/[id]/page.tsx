import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import Dashboard from '@/components/fs/dashboard';
import { FiscalOpinion } from '@/components/diagnostico/fiscal-opinion';
import { SitfisStatus } from '@/components/diagnostico/sitfis-status';
import { AnalysisWaiting } from '@/components/diagnostico/analysis-waiting';
import { sitfisStatusFor } from '@/lib/diagnostico/sitfis';
import { getAuth } from '@/lib/auth/server';
import { roleOf } from '@/lib/auth/roles';
import { scopeFor } from '@/lib/auth/scope';
import { savedReport } from '@/lib/diagnostico/store';
import { auditDocument } from '@/lib/documentos/store';
import { formatCnpj, money, summarize } from '@/lib/diagnostico/model';

export const dynamic = 'force-dynamic';
export default async function SavedDiagnosticPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const { id } = await params;
  const scope = scopeFor({ id: session.user.id, role: roleOf(session.user) });
  const report = await savedReport(id, scope);
  if (!report) notFound();
  await auditDocument(session.user.id, 'view-report', id);
  const totals = summarize(report);
  const rfbPending = report.sources.find(s => s.id === 'rfb')?.status === 'pendente';
  // Preliminar com consulta da Receita pedida: não mostra parecer com "Não informado". Em andamento, tela de espera;
  // concluída, vai direto à versão completa; em revisão ou falha, o aviso vem primeiro e a leitura só PGFN fica recolhida.
  const sitfis = rfbPending ? await sitfisStatusFor(id, scope).catch(() => null) : null;
  if (sitfis?.status === 'concluido' && sitfis.resultDocumentId && sitfis.resultDocumentId !== id) redirect(`/diagnostico/${sitfis.resultDocumentId}`);
  if (sitfis?.status === 'solicitado') return <Dashboard screen="diagnostico"><div className="diagnostic">
    <Link className="diag-text-button" href="/diagnostico">← Voltar ao acervo</Link>
    <AnalysisWaiting documentId={id} company={report.company.name} cnpj={formatCnpj(report.company.cnpj)} requestedAt={sitfis.createdAt} pgfnCount={totals.count} />
  </div></Dashboard>;
  const unfinished = sitfis?.status === 'revisao' || sitfis?.status === 'falhou';
  return <Dashboard screen="diagnostico"><div className="diagnostic">
    <Link className="diag-text-button" href="/diagnostico">← Voltar ao acervo</Link>
    <div className="diag-heading diag-hero"><div><p className="diag-eyebrow">{rfbPending ? 'PARECER FS · PRELIMINAR · DOCUMENTO SALVO' : 'PARECER FS · DOCUMENTO SALVO'}</p><h1>{report.company.name}</h1><p>{formatCnpj(report.company.cnpj)} · Versão {report.version} · Data-base {new Date(report.generatedAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p></div></div>
    <div className="diag-company-actions">{report.annexes?.length ? <a className="diag-button primary" href={`/api/documentos/${id}/completo?download=1`} target="_blank" rel="noopener noreferrer">Baixar parecer com {report.annexes.length} anexo{report.annexes.length === 1 ? '' : 's'}</a> : null}<a className={`diag-button${report.annexes?.length ? '' : ' primary'}`} href={`/api/documentos/${id}?download=1`} target="_blank" rel="noopener noreferrer">Baixar parecer FS em PDF</a><a className="diag-button" href={`/api/documentos/${id}`} target="_blank" rel="noopener noreferrer">Abrir PDF para imprimir</a></div>
    <SitfisStatus documentId={id} />
    {rfbPending && !sitfis && <div className="diag-alert" role="status"><p><strong>Receita Federal pendente.</strong> {report.sources.find(s => s.id === 'rfb')?.note} Os totais abaixo consideram apenas a PGFN; ausência de dados da RFB não significa ausência de débitos.</p></div>}
    {unfinished && <div className="diag-alert" role="status"><p>{sitfis!.status === 'revisao' ? 'A Receita Federal foi consultada e o relatório está guardado. A equipe FS ajusta a leitura e reprocessa sem nova consulta paga; você recebe um aviso quando o parecer completo ficar pronto.' : 'Abaixo está apenas a leitura preliminar da PGFN. Ela não substitui o parecer completo.'}</p></div>}
    <Preliminary hidden={unfinished}>
    <div className="diag-kpis"><div className="diag-kpi debt-total"><div>{rfbPending ? 'Total em cobrança · RFB pendente' : 'Total em cobrança'}</div><strong>{money(totals.total)}</strong><small>Recorte das fontes na data-base</small></div><div className="diag-kpi"><div>Dívida ativa · PGFN</div><strong>{money(totals.pgfn)}</strong><small>{totals.count} inscrições incluídas</small></div><div className="diag-kpi"><div>Receita Federal</div><strong>{money(totals.rfb)}</strong><small>{rfbPending ? 'Aguardando procuração no e-CAC' : 'Valores a vencer apresentados separadamente'}</small></div></div>
    <section className="diag-card diag-reading-summary"><h2>Síntese do levantamento</h2><p>{report.summary}</p><p>Documento para revisão técnica. Reabrir e baixar este parecer reutiliza a versão arquivada, sem nova consulta fiscal.</p></section>
    <FiscalOpinion report={report}/>
    </Preliminary>
  </div></Dashboard>;
}
// Em revisão ou falha, a leitura só com a PGFN fica recolhida para não parecer o resultado final.
function Preliminary({ hidden, children }: { hidden: boolean; children: React.ReactNode }) {
  return hidden ? <details className="diag-preliminary"><summary>Ver leitura preliminar (só PGFN)</summary>{children}</details> : <>{children}</>;
}
