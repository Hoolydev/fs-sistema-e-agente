import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { query } from '@/lib/comercial/store';
import { auditDocument, setupDocuments } from '@/lib/documentos/store';
import { consultCadastro } from './cadastro';
import { normalizeCnpj } from './model';
import { consultDividaAtiva, type PgfnFetch } from './pgfn';
import { preliminaryReport, FS_PROCURADOR_CNPJ_DEFAULT } from './preliminar';
import { archiveCanonicalReport } from './store';
import { ownerClause, type Scope } from '@/lib/auth/scope';

// Fluxo do botão "Analisar CNPJ" para lead: PGFN + cadastro público agora; SITFIS pendente de procuração.
// Uma consulta paga por CNPJ dentro da janela; reabrir dentro dela reutiliza o parecer arquivado.
export type ConsultaResult = { id: string; reportUrl: string; pdfUrl: string; version: number; reused: boolean; rfbPending: true };

const evidenceReady = new Map<string, Promise<void>>();
async function setupEvidence() {
  await setupDocuments();
  const key = process.env.FS_CRM_DATABASE_URL || process.env.DATABASE_URL || 'sqlite';
  if (!evidenceReady.has(key)) evidenceReady.set(key, query(`CREATE TABLE IF NOT EXISTS fs_diagnostic_evidence (id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES fs_documents(id), source_id TEXT NOT NULL, cnpj TEXT NOT NULL, http_status INTEGER NOT NULL, sha256 TEXT NOT NULL, collected_at TEXT NOT NULL, content ${key === 'sqlite' ? 'BLOB' : 'BYTEA'} NOT NULL)`).then(() => undefined).catch(e => { evidenceReady.delete(key); throw e; }));
  await evidenceReady.get(key);
}

// Reaproveitamento respeita o dono: externo só reutiliza parecer próprio; a FS só reutiliza pareceres internos.
export async function latestAppReport(cnpj: string, scope: Scope = null) {
  await setupDocuments();
  const owner = scope ? ownerClause(scope, 'd.owner_id', 2) : { sql: ' AND d.owner_id IS NULL', values: [] };
  const [row] = await query(`SELECT d.id, d.created_at, d.external_id FROM fs_documents d JOIN fs_diagnostic_reports r ON r.document_id=d.id WHERE d.cnpj=$1 AND d.kind='parecer' AND d.external_id LIKE 'app-%'${owner.sql} ORDER BY d.created_at DESC LIMIT 1`, [cnpj, ...owner.values]);
  return row ? { id: `doc_${row.id}`, createdAt: String(row.created_at), externalId: String(row.external_id) } : null;
}

export async function runPreliminaryDiagnostic(cnpjInput: string, actor: string, options: { env?: NodeJS.ProcessEnv; fetchImpl?: PgfnFetch; now?: () => Date; force?: boolean; scope?: Scope } = {}): Promise<ConsultaResult> {
  const env = options.env ?? process.env, now = options.now ?? (() => new Date()), scope = options.scope ?? null;
  const cnpj = normalizeCnpj(cnpjInput);
  const reuseHours = Number(env.FS_DIAGNOSTIC_REUSE_HOURS ?? 24);
  const previous = await latestAppReport(cnpj, scope);
  if (previous && !options.force && reuseHours > 0 && now().getTime() - new Date(previous.createdAt).getTime() < reuseHours * 3_600_000) {
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
  const [cadastro, pgfn] = await Promise.all([consultCadastro(cnpj, env, options.fetchImpl as typeof fetch | undefined), consultDividaAtiva(cnpj, env, options.fetchImpl, externalId)]);
  const report = preliminaryReport({ cnpj, cadastro, pgfn, reportId: `FS-PRE-${stamp}-${cnpj.slice(-6)}`, version, procuradorCnpj: env.FS_PROCURADOR_CNPJ || FS_PROCURADOR_CNPJ_DEFAULT });
  const logo = await readFile(join(process.cwd(), 'public/brand/fs-horizontal.png'));
  const id = await archiveCanonicalReport(externalId, report, logo, scope?.ownerId ?? null);
  await setupEvidence();
  await query('INSERT INTO fs_diagnostic_evidence (id,document_id,source_id,cnpj,http_status,sha256,collected_at,content) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO NOTHING', [`${id.slice(4)}:pgfn`, id.slice(4), 'pgfn', cnpj, pgfn.httpStatus, pgfn.sha256, pgfn.collectedAt, pgfn.raw]);
  await auditDocument(actor, 'app-diagnostic-preliminary', id);
  return { id, reportUrl: `/diagnostico/${id}`, pdfUrl: `/api/documentos/${id}`, version, reused: false, rfbPending: true };
}
