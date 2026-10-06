import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { query } from '@/lib/comercial/store';
import { ownedBy, type Scope } from '@/lib/auth/scope';
import { archiveDocument, auditDocument, setupDocuments } from '@/lib/documentos/store';
import { notifyUser } from '@/lib/avisos/store';
import { formatCnpj, normalizeCnpj, type DiagnosticReport } from './model';
import { archiveCanonicalReport } from './store';
import { setupEvidence, storedPgfn } from './consulta';
import { reportFromSerpro } from './serpro-evidence';
import { FS_PROCURADOR_CNPJ_DEFAULT } from './preliminar';

// Situação Fiscal da Receita (SITFIS) para empresas com procuração à FS. O sistema não tem o certificado da FS:
// pede ao agente da VPS (worker com Integra Contador), que consulta uma única vez (consulta cobrada) e devolve PDF e texto.
// O resultado vira nova versão do parecer (Receita + PGFN), reaproveitando a PGFN já consultada.
export type SitfisStatus = 'solicitado' | 'concluido' | 'revisao' | 'falhou';
export type SitfisRequest = { id: string; cnpj: string; baseDocumentId: string; status: SitfisStatus; message: string; resultDocumentId: string | null; sitfisDocumentId: string | null; createdAt: string; updatedAt: string };
export const DEFAULT_AGENT_URL = 'https://api.fssolucoestributarias.com.br';
let ready: Promise<void> | undefined;
export async function setupSitfis() {
  await setupDocuments();
  if (!ready) ready = (async () => {
    await query("CREATE TABLE IF NOT EXISTS fs_sitfis_requests (id TEXT PRIMARY KEY, cnpj TEXT NOT NULL, base_document_id TEXT NOT NULL, owner_id TEXT, requested_by TEXT NOT NULL, requested_by_name TEXT NOT NULL, status TEXT NOT NULL, message TEXT NOT NULL, result_document_id TEXT, sitfis_document_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
    // Texto extraído do PDF da Receita: permite reprocessar a leitura depois de ajuste no leitor, sem nova consulta cobrada.
    if (process.env.FS_CRM_DATABASE_URL || process.env.DATABASE_URL) await query('ALTER TABLE fs_sitfis_requests ADD COLUMN IF NOT EXISTS source_text TEXT');
    else await query('ALTER TABLE fs_sitfis_requests ADD COLUMN source_text TEXT').catch(() => {});
  })().catch(e => { ready = undefined; throw e; });
  await ready;
}
const toRequest = (r: Record<string, unknown>): SitfisRequest => ({ id: String(r.id), cnpj: String(r.cnpj), baseDocumentId: String(r.base_document_id), status: r.status as SitfisStatus, message: String(r.message), resultDocumentId: r.result_document_id ? String(r.result_document_id) : null, sitfisDocumentId: r.sitfis_document_id ? String(r.sitfis_document_id) : null, createdAt: String(r.created_at), updatedAt: String(r.updated_at) });
async function update(id: string, status: SitfisStatus, message: string, extra: { resultDocumentId?: string; sitfisDocumentId?: string } = {}) {
  await query('UPDATE fs_sitfis_requests SET status=$1, message=$2, result_document_id=COALESCE($3, result_document_id), sitfis_document_id=COALESCE($4, sitfis_document_id), updated_at=$5 WHERE id=$6', [status, message, extra.resultDocumentId ?? null, extra.sitfisDocumentId ?? null, new Date().toISOString(), id]);
}
// Último pedido do parecer-base (ou de qualquer versão derivada dele), respeitando o dono.
export async function sitfisStatusFor(documentId: string, scope: Scope): Promise<SitfisRequest | null> {
  await setupSitfis();
  const [row] = await query('SELECT * FROM fs_sitfis_requests WHERE base_document_id=$1 OR result_document_id=$2 ORDER BY created_at DESC LIMIT 1', [documentId, documentId]);
  return row && ownedBy(scope, row.owner_id ? String(row.owner_id) : null) ? toRequest(row) : null;
}
// Pede a consulta ao agente. Um pedido ativo ou concluído por parecer-base: repetir exige force (nova cobrança).
export async function requestSitfis(input: { baseDocumentId: string; cnpj: string; actor: { id: string; name: string }; ownerId: string | null; force?: boolean }, env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): Promise<SitfisRequest> {
  await setupSitfis();
  const cnpj = normalizeCnpj(input.cnpj);
  const [existing] = await query("SELECT * FROM fs_sitfis_requests WHERE base_document_id=$1 AND status IN ('solicitado','concluido') ORDER BY created_at DESC LIMIT 1", [input.baseDocumentId]);
  if (existing && !input.force) return toRequest(existing);
  const id = `sitfis-${randomUUID()}`, at = new Date().toISOString();
  await query('INSERT INTO fs_sitfis_requests (id,cnpj,base_document_id,owner_id,requested_by,requested_by_name,status,message,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [id, cnpj, input.baseDocumentId, input.ownerId, input.actor.id, input.actor.name, 'solicitado', 'Consulta da Receita Federal solicitada ao agente da FS.', at, at]);
  const token = env.FS_AGENT_SERVICE_TOKEN;
  if (!token) { await update(id, 'falhou', 'Integração com o agente não configurada no sistema (token ausente). Nenhuma consulta foi feita.'); return (await sitfisStatusFor(input.baseDocumentId, null))!; }
  try {
    const response = await fetchImpl(`${(env.FS_AGENT_URL || DEFAULT_AGENT_URL).replace(/\/$/, '')}/sistema/sitfis`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ requestId: id, cnpj }), signal: AbortSignal.timeout(15_000) });
    if (response.status !== 202 && response.status !== 200) await update(id, 'falhou', `O agente não aceitou o pedido (status ${response.status}). Nenhuma consulta foi feita.`);
  } catch { await update(id, 'falhou', 'O agente da FS não respondeu. Nenhuma consulta foi feita; tente novamente mais tarde.'); }
  return (await sitfisStatusFor(input.baseDocumentId, null))!;
}
const failureMessages: Record<string, string> = {
  access_denied: `A Receita/Serpro recusou a consulta. Confira se a empresa outorgou procuração eletrônica no e-CAC para a FS (CNPJ ${formatCnpj(FS_PROCURADOR_CNPJ_DEFAULT)}) com o serviço de Situação Fiscal.`,
  processing_timeout: 'O relatório seguiu em processamento no Serpro. A equipe precisa revisar antes de repetir (consulta cobrada).',
  protocol_unavailable: 'O Serpro não disponibilizou o protocolo do relatório. A equipe precisa revisar antes de repetir.',
  pdf_taxpayer_mismatch: 'O relatório recebido não confirmou o CNPJ da empresa e foi descartado.',
  credentials_missing: 'Credenciais do Integra Contador ausentes no agente. Nenhuma consulta foi feita.',
  certificate_missing: 'Certificado da FS indisponível no agente. Nenhuma consulta foi feita.',
  not_enabled: 'Integra Contador desativado no agente. Nenhuma consulta foi feita.',
};
// Resultado devolvido pelo agente. Idempotente: um pedido já finalizado não é reprocessado.
export async function completeSitfis(input: { requestId: string; cnpj: string; ok: boolean; code?: string; pdf?: Buffer; text?: string; collectedAt?: string; sha256?: string }) {
  await setupSitfis();
  const [row] = await query('SELECT * FROM fs_sitfis_requests WHERE id=$1', [input.requestId]);
  if (!row) throw new Error('NOT_FOUND');
  const request = toRequest(row), ownerId = row.owner_id ? String(row.owner_id) : null;
  if (request.status !== 'solicitado') return request;
  if (normalizeCnpj(input.cnpj) !== request.cnpj) throw new Error('CNPJ_MISMATCH');
  const notify = (text: string) => notifyUser('sitfis', String(row.requested_by), `${text} (CNPJ ${formatCnpj(request.cnpj)})`, `sitfis:${request.id}`).catch(() => {});
  if (!input.ok || !input.pdf || !input.text) {
    const message = failureMessages[input.code ?? ''] ?? 'A consulta da Receita Federal não foi concluída. A equipe precisa revisar antes de repetir.';
    await update(request.id, 'falhou', message); await notify(`Receita Federal: ${message}`);
    return (await sitfisStatusFor(request.baseDocumentId, null))!;
  }
  const pdf = input.pdf, hash = createHash('sha256').update(pdf).digest('hex');
  if (pdf.subarray(0, 5).toString() !== '%PDF-' || (input.sha256 && input.sha256 !== hash)) throw new Error('INVALID_PDF');
  const collectedAt = input.collectedAt && !Number.isNaN(Date.parse(input.collectedAt)) ? new Date(input.collectedAt).toISOString() : new Date().toISOString();
  const [base] = await query('SELECT company, payload FROM fs_documents d JOIN fs_diagnostic_reports r ON r.document_id=d.id WHERE d.id=$1', [request.baseDocumentId.slice(4)]);
  const previous = base ? JSON.parse(String(base.payload)) as DiagnosticReport : null;
  // O PDF oficial da Receita fica sempre na documentação da empresa, mesmo que o parecer precise de revisão.
  await query('UPDATE fs_sitfis_requests SET source_text=$1 WHERE id=$2', [input.text, request.id]);
  const sitfisDocumentId = await archiveDocument({ externalId: `sitfis-${request.id}`, cnpj: request.cnpj, company: previous?.company.name ?? `CNPJ ${request.cnpj}`, name: `Situacao Fiscal RFB ${request.cnpj} ${collectedAt.slice(0, 10)}.pdf`, kind: 'documento', createdAt: collectedAt, mime: 'application/pdf', source: 'Receita Federal / Serpro Integra Contador', docType: 'situacao_fiscal', ownerId }, pdf);
  const pgfn = await storedPgfn(request.baseDocumentId);
  try {
    if (!previous || !pgfn) throw new Error('BASE_EVIDENCE_MISSING');
    const [{ count }] = await query(`SELECT COUNT(*) AS count FROM fs_documents WHERE cnpj=$1 AND kind='parecer'${ownerId ? ' AND owner_id=$2' : ''}`, ownerId ? [request.cnpj, ownerId] : [request.cnpj]);
    const version = Number(count) + 1, stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    const annexes = [...(previous.annexes ?? []), { id: sitfisDocumentId, name: `Situacao Fiscal RFB ${request.cnpj}.pdf`, type: 'Relatório de situação fiscal (RFB)', createdAt: collectedAt, sha256: hash }];
    const report = reportFromSerpro({ cnpj: request.cnpj, rfbText: input.text, pgfn: pgfn.rows, pgfnNotFound: pgfn.outcome === 'sem_inscricoes', collectedAt, rfbHash: hash, pgfnHash: pgfn.sha256, reportId: previous.id, version, annexes });
    const logo = await readFile(join(process.cwd(), 'public/brand/fs-horizontal.png'));
    const documentId = await archiveCanonicalReport(`app-${ownerId ? `${ownerId.slice(0, 8)}-` : ''}${request.cnpj}-v${version}-${stamp}`, report, logo, ownerId);
    await setupEvidence();
    for (const [source, content, sha, status] of [['pgfn', pgfn.raw, pgfn.sha256, pgfn.httpStatus], ['rfb', pdf, hash, 200]] as const)
      await query('INSERT INTO fs_diagnostic_evidence (id,document_id,source_id,cnpj,http_status,sha256,collected_at,content) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO NOTHING', [`${documentId.slice(4)}:${source}`, documentId.slice(4), source, request.cnpj, status, sha, source === 'rfb' ? collectedAt : pgfn.collectedAt, content]);
    await auditDocument(String(row.requested_by), 'app-diagnostic-sitfis', documentId);
    await update(request.id, 'concluido', 'Situação Fiscal recebida: versão completa do parecer (Receita Federal + PGFN) emitida.', { resultDocumentId: documentId, sitfisDocumentId });
    await notify(`Parecer completo (Receita Federal + PGFN) de ${report.company.name} emitido no sistema`);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'erro';
    await update(request.id, 'revisao', `Situação Fiscal recebida e guardada na documentação da empresa, mas o relatório não pôde ser lido automaticamente (${code}). Use a leitura manual da Receita com o relatório anexado.`, { sitfisDocumentId });
    await notify('Situação Fiscal da Receita recebida, mas precisa de leitura manual na tela de análise');
  }
  return (await sitfisStatusFor(request.baseDocumentId, null))!;
}
// Releitura de um relatório já recebido (status revisao): usa o PDF arquivado e o texto guardado. Não consulta a Receita de novo.
export async function reprocessSitfis(requestId: string) {
  await setupSitfis();
  const [row] = await query('SELECT * FROM fs_sitfis_requests WHERE id=$1', [requestId]);
  if (!row) throw new Error('NOT_FOUND');
  if (row.status !== 'revisao' || !row.sitfis_document_id || !row.source_text) throw new Error('NOT_REPROCESSABLE');
  const [doc] = await query('SELECT content, created_at FROM fs_documents WHERE id=$1', [String(row.sitfis_document_id).slice(4)]);
  if (!doc) throw new Error('SITFIS_PDF_MISSING');
  await query("UPDATE fs_sitfis_requests SET status='solicitado', updated_at=$1 WHERE id=$2 AND status='revisao'", [new Date().toISOString(), requestId]);
  return completeSitfis({ requestId, cnpj: String(row.cnpj), ok: true, pdf: Buffer.from(doc.content as Uint8Array), text: String(row.source_text), collectedAt: String(doc.created_at) });
}
