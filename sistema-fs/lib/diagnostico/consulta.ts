import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { query } from '@/lib/comercial/store';
import { auditDocument, setupDocuments } from '@/lib/documentos/store';
import { consultCadastro } from './cadastro';
import { normalizeCnpj } from './model';
import { consultDividaAtiva, type PgfnFetch } from './pgfn';
import { preliminaryReport, FS_PROCURADOR_CNPJ_DEFAULT, type RfbManualReading } from './preliminar';
import type { DiagnosticReport } from './model';
import type { PgfnEvidence, PgfnRow } from './pgfn';
import { ownedBy } from '@/lib/auth/scope';
import { documentTypeLabel } from '@/lib/documentos/tipos';
import { archiveCanonicalReport } from './store';
import { ownerClause, type Scope } from '@/lib/auth/scope';

// Fluxo do botão "Analisar CNPJ" para lead: PGFN + cadastro público agora; SITFIS pendente de procuração.
// Uma consulta paga por CNPJ dentro da janela; reabrir dentro dela reutiliza o parecer arquivado.
export type ConsultaResult = { id: string; reportUrl: string; pdfUrl: string; version: number; reused: boolean; rfbPending: boolean; pgfnReused?: boolean };

const evidenceReady = new Map<string, Promise<void>>();
export async function setupEvidence() {
  await setupDocuments();
  const key = process.env.FS_CRM_DATABASE_URL || process.env.DATABASE_URL || 'sqlite';
  if (!evidenceReady.has(key)) evidenceReady.set(key, query(`CREATE TABLE IF NOT EXISTS fs_diagnostic_evidence (id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES fs_documents(id), source_id TEXT NOT NULL, cnpj TEXT NOT NULL, http_status INTEGER NOT NULL, sha256 TEXT NOT NULL, collected_at TEXT NOT NULL, content ${key === 'sqlite' ? 'BLOB' : 'BYTEA'} NOT NULL)`).then(() => undefined).catch(e => { evidenceReady.delete(key); throw e; }));
  await evidenceReady.get(key);
}

// Reaproveitamento respeita o dono: externo só reutiliza parecer próprio; a FS só reutiliza pareceres internos.
export async function latestAppReport(cnpj: string, scope: Scope = null) {
  await setupDocuments();
  const owner = scope ? ownerClause(scope, 'd.owner_id', 2) : { sql: ' AND d.owner_id IS NULL', values: [] };
  // Versões complementadas mantêm a data-base da consulta PGFN; o desempate é pelo número da versão.
  const version = (externalId: unknown) => Number(/-v(\d+)-/.exec(String(externalId))?.[1] ?? 0);
  const [row] = (await query(`SELECT d.id, d.created_at, d.external_id FROM fs_documents d JOIN fs_diagnostic_reports r ON r.document_id=d.id WHERE d.cnpj=$1 AND d.kind='parecer' AND d.external_id LIKE 'app-%'${owner.sql} ORDER BY d.created_at DESC LIMIT 50`, [cnpj, ...owner.values]))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || version(b.external_id) - version(a.external_id));
  return row ? { id: `doc_${row.id}`, createdAt: String(row.created_at), externalId: String(row.external_id) } : null;
}

// Evidência PGFN já paga, preservada com o parecer: permite nova versão (leitura da Receita, anexos) sem nova consulta.
export async function storedPgfn(documentId: string): Promise<PgfnEvidence | null> {
  await setupEvidence();
  const [row] = await query("SELECT http_status, sha256, collected_at, content FROM fs_diagnostic_evidence WHERE document_id=$1 AND source_id='pgfn'", [documentId.slice(4)]);
  if (!row) return null;
  const raw = Buffer.from(row.content as Uint8Array), status = Number(row.http_status);
  return { outcome: status === 404 ? 'sem_inscricoes' : 'inscricoes', rows: status === 404 ? [] : JSON.parse(raw.toString('utf8')) as PgfnRow[], raw, sha256: String(row.sha256), httpStatus: status, collectedAt: String(row.collected_at) };
}
// Anexos: documentos do acervo da mesma empresa e do mesmo dono, nunca pareceres; ordem preservada.
async function resolveAnnexes(ids: string[], cnpj: string, scope: Scope): Promise<NonNullable<DiagnosticReport['annexes']>> {
  await setupDocuments();
  const annexes: NonNullable<DiagnosticReport['annexes']> = [];
  for (const id of [...new Set(ids)].slice(0, 30)) {
    if (!/^doc_[a-zA-Z0-9-]{1,80}$/.test(id)) continue;
    const [row] = await query('SELECT id, cnpj, name, kind, doc_type, created_at, sha256, owner_id FROM fs_documents WHERE id=$1', [id.slice(4)]);
    if (!row || String(row.cnpj) !== cnpj || row.kind === 'parecer' || !ownedBy(scope, row.owner_id ? String(row.owner_id) : null)) throw new Error('ANNEX_NOT_ALLOWED');
    annexes.push({ id, name: String(row.name), type: documentTypeLabel(row.doc_type ? String(row.doc_type) : String(row.kind)), createdAt: new Date(String(row.created_at)).toISOString(), sha256: String(row.sha256) });
  }
  return annexes;
}
export async function runPreliminaryDiagnostic(cnpjInput: string, actor: string, options: { env?: NodeJS.ProcessEnv; fetchImpl?: PgfnFetch; now?: () => Date; force?: boolean; scope?: Scope; rfbManual?: RfbManualReading | null; annexIds?: string[] } = {}): Promise<ConsultaResult> {
  const env = options.env ?? process.env, now = options.now ?? (() => new Date()), scope = options.scope ?? null;
  const cnpj = normalizeCnpj(cnpjInput);
  const reuseHours = Number(env.FS_DIAGNOSTIC_REUSE_HOURS ?? 24);
  const previous = await latestAppReport(cnpj, scope);
  const annexes = await resolveAnnexes(options.annexIds ?? [], cnpj, scope), complement = !!options.rfbManual || annexes.length > 0;
  const withinWindow = !!previous && reuseHours > 0 && now().getTime() - new Date(previous.createdAt).getTime() < reuseHours * 3_600_000;
  // Complemento dentro da janela: nova versão com a mesma evidência PGFN, sem nova chamada cobrada.
  const reusedEvidence = withinWindow && complement && !options.force && previous ? await storedPgfn(previous.id) : null;
  if (previous && withinWindow && !options.force && !complement) {
    const [row] = await query('SELECT payload FROM fs_diagnostic_reports WHERE document_id=$1', [previous.id.slice(4)]);
    const version = Number(JSON.parse(String(row.payload)).version) || 1;
    await auditDocument(actor, 'app-diagnostic-reused', previous.id);
    return { id: previous.id, reportUrl: `/diagnostico/${previous.id}`, pdfUrl: `/api/documentos/${previous.id}`, version, reused: true, rfbPending: true };
  }
  const versionOwner = scope ? ownerClause(scope, 'owner_id', 2) : { sql: '', values: [] };
  const [{ count }] = await query(`SELECT COUNT(*) AS count FROM fs_documents WHERE cnpj=$1 AND kind='parecer'${versionOwner.sql}`, [cnpj, ...versionOwner.values]);
  const version = Number(count) + 1;
  const stamp = now().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const externalId = `app-${scope ? `${scope.ownerId.slice(0, 8)}-` : ''}${cnpj}-v${version}-${stamp}`;
  // Cadastro público não é cobrado nem bloqueante; a PGFN é a única chamada com contrato.
  const [cadastro, pgfn] = await Promise.all([consultCadastro(cnpj, env, options.fetchImpl as typeof fetch | undefined), reusedEvidence ?? consultDividaAtiva(cnpj, env, options.fetchImpl, externalId)]);
  const report = preliminaryReport({ cnpj, cadastro, pgfn, reportId: `FS-PRE-${stamp}-${cnpj.slice(-6)}`, version, procuradorCnpj: env.FS_PROCURADOR_CNPJ || FS_PROCURADOR_CNPJ_DEFAULT, rfbManual: options.rfbManual ?? null, annexes });
  const logo = await readFile(join(process.cwd(), 'public/brand/fs-horizontal.png'));
  const id = await archiveCanonicalReport(externalId, report, logo, scope?.ownerId ?? null);
  await setupEvidence();
  await query('INSERT INTO fs_diagnostic_evidence (id,document_id,source_id,cnpj,http_status,sha256,collected_at,content) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO NOTHING', [`${id.slice(4)}:pgfn`, id.slice(4), 'pgfn', cnpj, pgfn.httpStatus, pgfn.sha256, pgfn.collectedAt, pgfn.raw]);
  await auditDocument(actor, reusedEvidence ? 'app-diagnostic-complemented' : 'app-diagnostic-preliminary', id);
  return { id, reportUrl: `/diagnostico/${id}`, pdfUrl: `/api/documentos/${id}`, version, reused: false, rfbPending: report.sources.find(s => s.id === 'rfb')?.status === 'pendente', pgfnReused: !!reusedEvidence };
}

// Correção de um parecer preliminar já emitido: nova versão com a mesma evidência PGFN (sem nova consulta cobrada),
// pela regra atual do gerador. Mantém dono e anexos; leitura manual da Receita precisa ser refeita pela tela.
export async function reissuePreliminary(documentId: string, actor: string, options: { env?: NodeJS.ProcessEnv; fetchImpl?: PgfnFetch; now?: () => Date } = {}): Promise<ConsultaResult> {
  const env = options.env ?? process.env, now = options.now ?? (() => new Date());
  await setupDocuments();
  const [doc] = await query("SELECT d.cnpj, d.owner_id, r.payload FROM fs_documents d JOIN fs_diagnostic_reports r ON r.document_id=d.id WHERE d.id=$1 AND d.external_id LIKE 'app-%'", [documentId.slice(4)]);
  if (!doc) throw new Error('REPORT_NOT_FOUND');
  const previous = JSON.parse(String(doc.payload)) as DiagnosticReport;
  if (previous.rfbDeclaration) throw new Error('MANUAL_READING_REISSUE_UNSUPPORTED');
  const pgfn = await storedPgfn(documentId);
  if (!pgfn) throw new Error('EVIDENCE_NOT_FOUND');
  const cnpj = String(doc.cnpj), ownerId = doc.owner_id ? String(doc.owner_id) : null;
  const [{ count }] = await query(`SELECT COUNT(*) AS count FROM fs_documents WHERE cnpj=$1 AND kind='parecer'${ownerId ? ' AND owner_id=$2' : ''}`, ownerId ? [cnpj, ownerId] : [cnpj]);
  const version = Number(count) + 1, stamp = now().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const externalId = `app-${ownerId ? `${ownerId.slice(0, 8)}-` : ''}${cnpj}-v${version}-${stamp}`;
  const cadastro = await consultCadastro(cnpj, env, options.fetchImpl as typeof fetch | undefined);
  const report = preliminaryReport({ cnpj, cadastro, pgfn, reportId: previous.id, version, procuradorCnpj: env.FS_PROCURADOR_CNPJ || FS_PROCURADOR_CNPJ_DEFAULT, annexes: previous.annexes });
  const logo = await readFile(join(process.cwd(), 'public/brand/fs-horizontal.png'));
  const id = await archiveCanonicalReport(externalId, report, logo, ownerId);
  await setupEvidence();
  await query('INSERT INTO fs_diagnostic_evidence (id,document_id,source_id,cnpj,http_status,sha256,collected_at,content) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO NOTHING', [`${id.slice(4)}:pgfn`, id.slice(4), 'pgfn', cnpj, pgfn.httpStatus, pgfn.sha256, pgfn.collectedAt, pgfn.raw]);
  await auditDocument(actor, 'app-diagnostic-reissued', id);
  return { id, reportUrl: `/diagnostico/${id}`, pdfUrl: `/api/documentos/${id}`, version, reused: false, rfbPending: report.sources.find(s => s.id === 'rfb')?.status === 'pendente', pgfnReused: true };
}
